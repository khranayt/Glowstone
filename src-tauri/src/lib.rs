use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use notify::{EventKind, RecursiveMode, Watcher};
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use walkdir::WalkDir;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: String,
    pub font_size: u32,
    pub line_numbers: bool,
    pub readable_line_length: bool,
    pub auto_save: bool,
    pub spellcheck: bool,
    pub confirm_delete: bool,
    pub last_vault: Option<String>,
    pub recent_vaults: Vec<String>,
    pub recent_files: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            font_size: 16,
            line_numbers: false,
            readable_line_length: true,
            auto_save: true,
            spellcheck: false,
            confirm_delete: true,
            last_vault: None,
            recent_vaults: Vec::new(),
            recent_files: Vec::new(),
        }
    }
}

struct AppState {
    settings: Mutex<Settings>,
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    let Some(path) = config_path(app) else {
        return Settings::default();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
        .unwrap_or_default()
}

fn persist_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = config_path(app).ok_or("Could not resolve the configuration directory")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Settings, String> {
    {
        let mut current = state.settings.lock().unwrap();
        *current = settings;
        persist_settings(&app, &current)?;
        Ok(current.clone())
    }
}

#[tauri::command]
fn add_recent_file(state: State<'_, AppState>, app: AppHandle, path: String) -> Result<(), String> {
    let mut current = state.settings.lock().unwrap();
    current.recent_files.retain(|p| p != &path);
    current.recent_files.insert(0, path);
    current.recent_files.truncate(30);
    persist_settings(&app, &current)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn norm(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn is_ignored_name(name: &str) -> bool {
    name.starts_with('.')
        || name == "node_modules"
        || name.ends_with('~')
        || name.ends_with(".swp")
        || name.ends_with(".tmp")
}

fn is_note(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()),
        Some(ext) if ext == "md" || ext == "markdown"
    )
}

fn vault_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| norm(path))
}

fn sanitize_name(name: &str) -> String {
    let re = Regex::new(r#"[\\/:*?"<>|]"#).unwrap();
    let cleaned = re.replace_all(name.trim(), "").trim().to_string();
    if cleaned.is_empty() {
        "Untitled".to_string()
    } else {
        cleaned
    }
}

fn unique_path(dir: &Path, name: &str, extension: Option<&str>) -> PathBuf {
    let base_path = Path::new(name);
    let existing_ext = base_path.extension().and_then(|e| e.to_str());
    let (stem, ext) = match (existing_ext, extension) {
        (Some(e), Some(required)) if e.eq_ignore_ascii_case(required) => (
            base_path.file_stem().unwrap().to_string_lossy().to_string(),
            e.to_string(),
        ),
        (Some(_), Some(required)) => (
            name.to_string(),
            required.to_string(),
        ),
        (Some(e), None) => (
            base_path.file_stem().unwrap().to_string_lossy().to_string(),
            e.to_string(),
        ),
        (None, Some(required)) => (name.to_string(), required.to_string()),
        (None, None) => (name.to_string(), String::new()),
    };

    let mut candidate = dir.join(if ext.is_empty() {
        stem.clone()
    } else {
        format!("{stem}.{ext}")
    });
    let mut index = 1;
    while candidate.exists() {
        let file = if ext.is_empty() {
            format!("{stem} {index}")
        } else {
            format!("{stem} {index}.{ext}")
        };
        candidate = dir.join(file);
        index += 1;
    }
    candidate
}

fn rel_id(path: &Path, vault: &Path) -> String {
    path.strip_prefix(vault)
        .map(|p| p.with_extension(""))
        .map(|p| norm(&p))
        .unwrap_or_else(|_| norm(&path.with_extension("")))
}

// ---------------------------------------------------------------------------
// File tree
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    ext: String,
    children: Vec<FileNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultInfo {
    name: String,
    path: String,
    note_count: usize,
}

fn read_dir_tree(dir: &Path) -> Vec<FileNode> {
    let mut entries: Vec<FileNode> = Vec::new();
    let Ok(reader) = fs::read_dir(dir) else {
        return entries;
    };
    for entry in reader.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if is_ignored_name(&name) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            if meta.file_type().is_symlink() {
                continue;
            }
            let children = read_dir_tree(&path);
            entries.push(FileNode {
                name,
                path: norm(&path),
                is_dir: true,
                ext: String::new(),
                children,
            });
        } else if meta.is_file() {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_ascii_lowercase())
                .unwrap_or_default();
            entries.push(FileNode {
                name,
                path: norm(&path),
                is_dir: false,
                ext,
                children: Vec::new(),
            });
        }
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries
}

fn count_notes(dir: &Path) -> usize {
    WalkDir::new(dir)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules"
        })
        .flatten()
        .filter(|e| e.file_type().is_file() && is_note(e.path()))
        .count()
}

#[tauri::command]
fn list_tree(vault: String) -> Result<Vec<FileNode>, String> {
    let path = PathBuf::from(&vault);
    if !path.is_dir() {
        return Err("Vault folder does not exist".into());
    }
    Ok(read_dir_tree(&path))
}

#[tauri::command]
fn open_vault(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<VaultInfo, String> {
    let canonical = fs::canonicalize(&path).map_err(|_| "Vault folder does not exist".to_string())?;
    if !canonical.is_dir() {
        return Err("Vault path is not a folder".into());
    }
    let vault_str = norm(&canonical);
    let info = VaultInfo {
        name: vault_name(&canonical),
        path: vault_str.clone(),
        note_count: count_notes(&canonical),
    };

    {
        let mut settings = state.settings.lock().unwrap();
        settings.last_vault = Some(vault_str.clone());
        settings.recent_vaults.retain(|p| p != &vault_str);
        settings.recent_vaults.insert(0, vault_str);
        settings.recent_vaults.truncate(12);
        persist_settings(&app, &settings)?;
    }

    start_watcher(&app, canonical, &state)?;
    Ok(info)
}

#[tauri::command]
fn close_vault(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut watcher = state.watcher.lock().unwrap();
    *watcher = None;
    let mut settings = state.settings.lock().unwrap();
    settings.last_vault = None;
    persist_settings(&app, &settings)
}

#[tauri::command]
fn stats(vault: String) -> Result<VaultInfo, String> {
    let path = PathBuf::from(&vault);
    if !path.is_dir() {
        return Err("Vault folder does not exist".into());
    }
    Ok(VaultInfo {
        name: vault_name(&path),
        path: norm(&path),
        note_count: count_notes(&path),
    })
}

// ---------------------------------------------------------------------------
// Reading / writing
// ---------------------------------------------------------------------------

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|_| "File not found".to_string())?;
    if meta.len() > 20 * 1024 * 1024 {
        return Err("File is too large to open".into());
    }
    fs::read_to_string(&p).map_err(|e| format!("Could not read file: {e}"))
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&p, content).map_err(|e| format!("Could not save file: {e}"))
}

#[tauri::command]
fn create_note(parent: String, name: String) -> Result<String, String> {
    let dir = PathBuf::from(&parent);
    if !dir.is_dir() {
        return Err("Folder does not exist".into());
    }
    let cleaned = sanitize_name(&name);
    let path = unique_path(&dir, &cleaned, Some("md"));
    fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(norm(&path))
}

#[tauri::command]
fn create_folder(parent: String, name: String) -> Result<String, String> {
    let dir = PathBuf::from(&parent);
    if !dir.is_dir() {
        return Err("Folder does not exist".into());
    }
    let cleaned = sanitize_name(&name);
    let path = unique_path(&dir, &cleaned, None);
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(norm(&path))
}

#[tauri::command]
fn rename_entry(path: String, new_name: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    if !src.exists() {
        return Err("Item does not exist".into());
    }
    let mut cleaned = sanitize_name(&new_name);
    if src.is_file() {
        if let Some(old_ext) = src.extension().and_then(|e| e.to_str()) {
            let has_ext = Path::new(&cleaned)
                .extension()
                .and_then(|e| e.to_str())
                .is_some();
            if !has_ext {
                cleaned = format!("{cleaned}.{old_ext}");
            }
        }
    }
    let parent = src.parent().ok_or("Cannot rename this item")?;
    let dest = parent.join(&cleaned);
    if dest == src {
        return Ok(norm(&src));
    }
    if dest.exists() {
        return Err("An item with that name already exists".into());
    }
    fs::rename(&src, &dest).map_err(|e| format!("Could not rename: {e}"))?;
    Ok(norm(&dest))
}

#[tauri::command]
fn move_entry(path: String, target_dir: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let dest_dir = PathBuf::from(&target_dir);
    if !src.exists() {
        return Err("Item does not exist".into());
    }
    if !dest_dir.is_dir() {
        return Err("Destination folder does not exist".into());
    }
    if src.is_dir() && dest_dir.starts_with(&src) {
        return Err("Cannot move a folder inside itself".into());
    }
    if src.parent() == Some(dest_dir.as_path()) {
        return Ok(norm(&src));
    }
    let name = src.file_name().ok_or("Invalid item")?.to_string_lossy().to_string();
    let ext = src.extension().and_then(|e| e.to_str()).map(|s| s.to_string());
    let dest = unique_path(&dest_dir, &name, ext.as_deref());
    fs::rename(&src, &dest).map_err(|e| format!("Could not move: {e}"))?;
    Ok(norm(&dest))
}

#[tauri::command]
fn delete_entry(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Item does not exist".into());
    }
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| format!("Could not delete folder: {e}"))
    } else {
        fs::remove_file(&p).map_err(|e| format!("Could not delete file: {e}"))
    }
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn read_attachment(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|_| "File not found".to_string())?;
    if meta.len() > 40 * 1024 * 1024 {
        return Err("File is too large".into());
    }
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    let mime = mime_guess::from_path(&p)
        .first_or_octet_stream()
        .to_string();
    Ok(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchHit {
    line: usize,
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchFile {
    path: String,
    title: String,
    matches: Vec<SearchHit>,
}

#[tauri::command]
fn search_vault(vault: String, query: String, case_sensitive: bool) -> Result<Vec<SearchFile>, String> {
    let root = PathBuf::from(&vault);
    if !root.is_dir() {
        return Err("Vault folder does not exist".into());
    }
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let needle = if case_sensitive {
        query.clone()
    } else {
        query.to_lowercase()
    };

    let mut results: Vec<SearchFile> = Vec::new();
    let mut total_hits = 0usize;

    let walker = WalkDir::new(&root).into_iter().filter_entry(|e| {
        if e.depth() == 0 {
            return true;
        }
        let name = e.file_name().to_string_lossy();
        !name.starts_with('.') && name != "node_modules"
    });

    for entry in walker.flatten() {
        if total_hits >= 400 {
            break;
        }
        let path = entry.path();
        if !entry.file_type().is_file() || !is_note(path) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if meta.len() > 4 * 1024 * 1024 {
            continue;
        }
        let Ok(content) = fs::read_to_string(path) else { continue };
        let mut matches = Vec::new();
        for (idx, line) in content.lines().enumerate() {
            let haystack = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            if haystack.contains(&needle) {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                matches.push(SearchHit {
                    line: idx + 1,
                    text: if line.len() > 300 {
                        format!("{}…", &line[..300])
                    } else {
                        line.to_string()
                    },
                });
                total_hits += 1;
                if matches.len() >= 6 || total_hits >= 400 {
                    break;
                }
            }
        }
        if !matches.is_empty() {
            results.push(SearchFile {
                path: norm(path),
                title: path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| norm(path)),
                matches,
            });
        }
    }
    results.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(results)
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphNode {
    id: String,
    title: String,
    path: String,
    folder: String,
    degree: usize,
    unresolved: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphLink {
    source: String,
    target: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphData {
    nodes: Vec<GraphNode>,
    links: Vec<GraphLink>,
}

fn wikilink_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"!?\[\[([^\]\n]{1,300})\]\]").unwrap())
}

fn mdlink_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"!?\[[^\]\n]*\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)"#).unwrap()
    })
}

fn inline_code_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"`+[^`\n]*`+").unwrap())
}

/// Notes often contain link syntax inside code samples. Strip frontmatter and
/// code before scanning for links so the graph only reflects real links.
fn scan_text(content: &str) -> String {
    let mut body = content;
    if let Some(rest) = body.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            body = &rest[end + 4..];
        }
    }

    let mut out = String::with_capacity(body.len());
    let mut fence: Option<&str> = None;
    for line in body.lines() {
        let trimmed = line.trim_start();
        if let Some(marker) = fence {
            if trimmed.starts_with(marker) {
                fence = None;
            }
            out.push('\n');
            continue;
        }
        if trimmed.starts_with("```") {
            fence = Some("```");
            out.push('\n');
            continue;
        }
        if trimmed.starts_with("~~~") {
            fence = Some("~~~");
            out.push('\n');
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }

    inline_code_regex().replace_all(&out, "").into_owned()
}

const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico", "mp3", "mp4", "webm", "pdf",
    "wav", "ogg", "mov", "mkv",
];

fn looks_like_attachment(target: &str) -> bool {
    let clean = target.split(['#', '?']).next().unwrap_or(target);
    let ext = Path::new(clean)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    IMAGE_EXTS.contains(&ext.as_str())
}

fn normalize_rel(base_dir: &str, target: &str) -> String {
    let mut parts: Vec<&str> = base_dir
        .split('/')
        .filter(|s| !s.is_empty() && *s != ".")
        .collect();
    for seg in target.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    parts.join("/")
}

fn resolve_target(
    target: &str,
    note_dir: &str,
    by_id: &HashMap<String, String>,
    by_title: &HashMap<String, String>,
) -> Option<String> {
    let mut clean = target.trim().to_string();
    if clean.is_empty() {
        return None;
    }
    if let Some(idx) = clean.find(['|', '#']) {
        clean.truncate(idx);
    }
    clean = clean.trim().trim_matches('<').trim_matches('>').to_string();
    if clean.is_empty() || clean.contains("://") || clean.starts_with("mailto:") {
        return None;
    }
    if looks_like_attachment(&clean) {
        return None;
    }
    clean = clean.replace('\\', "/");
    let stripped = clean.trim_start_matches('/').to_string();
    let stripped = stripped.strip_suffix(".md").unwrap_or(&stripped).to_string();
    let stripped = stripped
        .strip_suffix(".markdown")
        .unwrap_or(&stripped)
        .to_string();

    // Relative to the current note's folder.
    let rel = normalize_rel(note_dir, &stripped);
    if let Some(id) = by_id.get(&rel.to_lowercase()) {
        return Some(id.clone());
    }
    // Relative to the vault root.
    if let Some(id) = by_id.get(&stripped.to_lowercase()) {
        return Some(id.clone());
    }
    // Fall back to matching a note title.
    let base = stripped.rsplit('/').next().unwrap_or(&stripped);
    if let Some(id) = by_title.get(&base.to_lowercase()) {
        return Some(id.clone());
    }
    if let Some(id) = by_title.get(&stripped.to_lowercase()) {
        return Some(id.clone());
    }
    None
}

#[tauri::command]
fn get_graph(vault: String) -> Result<GraphData, String> {
    let root = PathBuf::from(&vault);
    if !root.is_dir() {
        return Err("Vault folder does not exist".into());
    }

    let mut notes: Vec<(PathBuf, String, String, String)> = Vec::new(); // path, id, title, dir
    let walker = WalkDir::new(&root).into_iter().filter_entry(|e| {
        if e.depth() == 0 {
            return true;
        }
        let name = e.file_name().to_string_lossy();
        !name.starts_with('.') && name != "node_modules"
    });
    for entry in walker.flatten() {
        if !entry.file_type().is_file() || !is_note(entry.path()) {
            continue;
        }
        let path = entry.path().to_path_buf();
        let id = rel_id(&path, &root);
        let title = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| id.clone());
        let dir = id.rsplit_once('/').map(|(d, _)| d.to_string()).unwrap_or_default();
        notes.push((path, id, title, dir));
    }

    let mut by_id: HashMap<String, String> = HashMap::new();
    let mut by_title: HashMap<String, String> = HashMap::new();
    let mut paths: HashMap<String, String> = HashMap::new();
    for (path, id, title, _) in &notes {
        by_id.entry(id.to_lowercase()).or_insert_with(|| id.clone());
        by_title
            .entry(title.to_lowercase())
            .or_insert_with(|| id.clone());
        paths.insert(id.clone(), norm(path));
    }

    let mut unresolved: HashMap<String, String> = HashMap::new();
    let mut edges: HashSet<(String, String)> = HashSet::new();
    let mut degrees: HashMap<String, usize> = HashMap::new();

    for (path, source_id, _, dir) in &notes {
        let Ok(content) = fs::read_to_string(path) else { continue };
        if content.len() > 4 * 1024 * 1024 {
            continue;
        }
        let scan = scan_text(&content);
        let mut targets: Vec<String> = Vec::new();
        for cap in wikilink_regex().captures_iter(&scan) {
            let raw = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let label = raw.split('|').next().unwrap_or(raw);
            if let Some(id) = resolve_target(label, dir, &by_id, &by_title) {
                targets.push(id);
            } else {
                let clean = label.split(['#', '|']).next().unwrap_or(label).trim();
                if !clean.is_empty() && !looks_like_attachment(clean) {
                    let key = format!("unresolved:{}", clean.to_lowercase());
                    unresolved.entry(key.clone()).or_insert_with(|| clean.to_string());
                    targets.push(key);
                }
            }
        }
        for cap in mdlink_regex().captures_iter(&scan) {
            let raw = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            if raw.starts_with('#') {
                continue;
            }
            if let Some(id) = resolve_target(raw, dir, &by_id, &by_title) {
                targets.push(id);
            }
        }
        for target in targets {
            if &target == source_id {
                continue;
            }
            if edges.insert((source_id.clone(), target.clone())) {
                *degrees.entry(source_id.clone()).or_insert(0) += 1;
                *degrees.entry(target.clone()).or_insert(0) += 1;
            }
        }
    }

    let mut nodes: Vec<GraphNode> = notes
        .iter()
        .map(|(_, id, title, dir)| GraphNode {
            id: id.clone(),
            title: title.clone(),
            path: paths.get(id).cloned().unwrap_or_default(),
            folder: dir.clone(),
            degree: *degrees.get(id).unwrap_or(&0),
            unresolved: false,
        })
        .collect();

    for (id, title) in &unresolved {
        if !notes.iter().any(|(_, nid, _, _)| nid == id) {
            nodes.push(GraphNode {
                id: id.clone(),
                title: title.clone(),
                path: String::new(),
                folder: String::new(),
                degree: *degrees.get(id).unwrap_or(&0),
                unresolved: true,
            });
        }
    }

    let links: Vec<GraphLink> = edges
        .into_iter()
        .map(|(source, target)| GraphLink { source, target })
        .collect();

    Ok(GraphData { nodes, links })
}

// ---------------------------------------------------------------------------
// File watcher
// ---------------------------------------------------------------------------

fn start_watcher(app: &AppHandle, vault: PathBuf, state: &State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.watcher.lock().unwrap();
    *guard = None;

    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else { return };
        if !matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) | EventKind::Any
        ) {
            return;
        }
        let paths: Vec<String> = event
            .paths
            .iter()
            .filter(|p| {
                let name = p.file_name().map(|n| n.to_string_lossy().to_string());
                match name {
                    Some(n) => !n.ends_with(".tmp") && !n.ends_with('~'),
                    None => true,
                }
            })
            .map(|p| norm(p))
            .collect();
        if should_emit(paths.iter().map(String::as_str)) {
            // Small delay so bursty editors settle before the UI re-reads files.
            std::thread::sleep(Duration::from_millis(120));
            let _ = handle.emit("vault-changed", paths);
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&vault, RecursiveMode::Recursive)
        .map_err(|e| format!("Could not watch vault: {e}"))?;
    *guard = Some(watcher);
    Ok(())
}

fn should_emit<'a>(paths: impl Iterator<Item = &'a str>) -> bool {
    let mut any = false;
    for path in paths {
        let lower = path.to_lowercase();
        if lower.contains("/.git/")
            || lower.contains("/.glowstone/")
            || lower.contains("/.obsidian/")
            || lower.contains("/.trash/")
            || lower.contains("/node_modules/")
        {
            continue;
        }
        any = true;
    }
    any
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let settings = load_settings(app.handle());
            app.manage(AppState {
                settings: Mutex::new(settings),
                watcher: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            add_recent_file,
            open_vault,
            close_vault,
            stats,
            list_tree,
            read_file,
            write_file,
            create_note,
            create_folder,
            rename_entry,
            move_entry,
            delete_entry,
            file_exists,
            read_attachment,
            search_vault,
            get_graph
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glowstone");
}
