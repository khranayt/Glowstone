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
    pub language: String,
    pub font_size: u32,
    pub line_numbers: bool,
    pub readable_line_length: bool,
    pub auto_save: bool,
    pub spellcheck: bool,
    pub confirm_delete: bool,
    pub onboarding_complete: bool,
    pub show_ribbon: bool,
    pub show_status_bar: bool,
    pub daily_note_folder: String,
    pub disabled_plugins: Vec<String>,
    pub default_file_to_open: String,
    pub default_file: String,
    pub always_focus_new_tabs: bool,
    pub new_note_location: String,
    pub new_note_folder: String,
    pub attachment_location: String,
    pub attachment_folder: String,
    pub last_vault: Option<String>,
    pub recent_vaults: Vec<String>,
    pub recent_files: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            language: "en".into(),
            font_size: 16,
            line_numbers: false,
            readable_line_length: true,
            auto_save: true,
            spellcheck: false,
            confirm_delete: true,
            onboarding_complete: false,
            show_ribbon: true,
            show_status_bar: true,
            daily_note_folder: String::new(),
            disabled_plugins: Vec::new(),
            default_file_to_open: "last".into(),
            default_file: String::new(),
            always_focus_new_tabs: true,
            new_note_location: "current".into(),
            new_note_folder: String::new(),
            attachment_location: "folder".into(),
            attachment_folder: "attachments".into(),
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
    let re = Regex::new(r#"[\\/:*?"<>|\x00-\x1f]"#).unwrap();
    let cleaned = re
        .replace_all(name.trim(), "")
        .trim()
        .trim_matches(['.', ' '])
        .to_string();
    if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
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
    modified: Option<u64>,
    created: Option<u64>,
    children: Vec<FileNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultInfo {
    name: String,
    path: String,
    note_count: usize,
}

fn system_time_secs(value: std::io::Result<std::time::SystemTime>) -> Option<u64> {
    value
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
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
        let modified = system_time_secs(meta.modified());
        let created = system_time_secs(meta.created());
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
                modified,
                created,
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
                modified,
                created,
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

    // File watching is a convenience; some mobile filesystems do not provide it.
    if let Err(error) = start_watcher(&app, canonical, &state) {
        eprintln!("File watcher unavailable: {error}");
    }
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

fn sniff_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"BM") {
        Some("image/bmp")
    } else if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        Some("image/x-icon")
    } else if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" && (&bytes[8..12] == b"avif" || &bytes[8..12] == b"avis") {
        Some("image/avif")
    } else {
        let head = &bytes[..bytes.len().min(256)];
        let text = String::from_utf8_lossy(head).trim_start().to_lowercase();
        if text.starts_with("<svg") || (text.starts_with("<?xml") && text.contains("<svg")) {
            Some("image/svg+xml")
        } else {
            None
        }
    }
}

#[tauri::command]
fn read_attachment(vault: String, path: String) -> Result<String, String> {
    let root = fs::canonicalize(&vault).map_err(|_| "Vault folder does not exist".to_string())?;
    let p = fs::canonicalize(&path).map_err(|_| "File not found".to_string())?;
    if !p.starts_with(&root) {
        return Err("Attachment must stay inside the vault".into());
    }
    let meta = fs::metadata(&p).map_err(|_| "File not found".to_string())?;
    if meta.len() > 40 * 1024 * 1024 {
        return Err("File is too large".into());
    }
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    let mut mime = mime_guess::from_path(&p)
        .first_or_octet_stream()
        .to_string();
    // Clipboard images saved without a useful extension still need to display.
    if mime == "application/octet-stream" || mime == "text/plain" {
        if let Some(sniffed) = sniff_image_mime(&bytes) {
            mime = sniffed.to_string();
        }
    }
    Ok(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
}

/// Resolve a vault-relative folder, refusing anything that escapes the vault.
fn vault_subfolder(vault: &str, folder: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(vault);
    if !root.is_dir() {
        return Err("Vault folder does not exist".into());
    }
    let mut out = root;
    for part in folder.replace('\\', "/").split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err("Folder must stay inside the vault".into());
        }
        out.push(part);
    }
    Ok(out)
}

#[tauri::command]
fn ensure_vault_folder(vault: String, folder: String) -> Result<String, String> {
    let dir = vault_subfolder(&vault, &folder)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create folder: {e}"))?;
    Ok(norm(&dir))
}

#[tauri::command]
fn save_attachment(
    vault: String,
    folder: String,
    name: String,
    data: String,
) -> Result<String, String> {
    let dir = vault_subfolder(&vault, &folder)?;
    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|_| "Invalid attachment data".to_string())?;
    if bytes.len() > 40 * 1024 * 1024 {
        return Err("File is too large".into());
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create folder: {e}"))?;
    let cleaned = sanitize_name(&name);
    let path = unique_path(&dir, &cleaned, None);
    fs::write(&path, bytes).map_err(|e| format!("Could not save attachment: {e}"))?;
    Ok(norm(&path))
}

#[tauri::command]
fn copy_attachment(vault: String, folder: String, source: String) -> Result<String, String> {
    let dir = vault_subfolder(&vault, &folder)?;
    let src = PathBuf::from(&source);
    let meta = fs::metadata(&src).map_err(|_| "File not found".to_string())?;
    if meta.len() > 40 * 1024 * 1024 {
        return Err("File is too large".into());
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create folder: {e}"))?;
    let name = src
        .file_name()
        .ok_or("Invalid file")?
        .to_string_lossy()
        .to_string();
    let cleaned = sanitize_name(&name);
    let dest = unique_path(&dir, &cleaned, None);
    fs::copy(&src, &dest).map_err(|e| format!("Could not copy attachment: {e}"))?;
    Ok(norm(&dest))
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

fn clip_line(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let mut clipped: String = text.chars().take(max_chars).collect();
    clipped.push('…');
    clipped
}

#[tauri::command]
fn search_vault(vault: String, query: String, case_sensitive: bool) -> Result<Vec<SearchFile>, String> {
    let root = PathBuf::from(&vault);
    if !root.is_dir() {
        return Err("Vault folder does not exist".into());
    }
    // All whitespace-separated terms must appear somewhere in the note. Matching
    // at file level (instead of per line) is what people expect from full-text
    // search: "rust graph" should find a note that mentions both, even on
    // different lines. Lines are ranked by how many terms they contain.
    let terms: Vec<String> = if case_sensitive {
        query.split_whitespace().map(str::to_string).collect()
    } else {
        query
            .split_whitespace()
            .map(|term| term.to_lowercase())
            .collect()
    };
    if terms.is_empty() {
        return Ok(Vec::new());
    }

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
        let searchable = if case_sensitive {
            content.clone()
        } else {
            content.to_lowercase()
        };
        if !terms.iter().all(|term| searchable.contains(term)) {
            continue;
        }
        let mut line_hits: Vec<(usize, SearchHit)> = Vec::new();
        for (idx, line) in content.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let haystack = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            let matched = terms.iter().filter(|term| haystack.contains(*term)).count();
            if matched > 0 {
                line_hits.push((
                    matched,
                    SearchHit {
                        line: idx + 1,
                        text: clip_line(trimmed, 300),
                    },
                ));
            }
        }
        if line_hits.is_empty() {
            continue;
        }
        line_hits.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.line.cmp(&b.1.line)));
        let mut matches: Vec<SearchHit> = Vec::new();
        for (_, hit) in line_hits {
            matches.push(hit);
            total_hits += 1;
            if matches.len() >= 8 || total_hits >= 400 {
                break;
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
    results.sort_by(|a, b| {
        b.matches
            .len()
            .cmp(&a.matches.len())
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });
    Ok(results)
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    path: String,
    imported: usize,
    skipped: usize,
}

fn xml_unescape(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

fn parse_csv_row(line: &str) -> Vec<String> {
    let mut cells = Vec::new();
    let mut cell = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cell.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => {
                cells.push(cell.trim().to_string());
                cell.clear();
            }
            _ => cell.push(ch),
        }
    }
    cells.push(cell.trim().to_string());
    cells
}

fn csv_to_markdown(raw: &str) -> String {
    let rows: Vec<Vec<String>> = raw
        .lines()
        .filter(|line| !line.trim().is_empty())
        .take(400)
        .map(parse_csv_row)
        .collect();
    if rows.is_empty() {
        return String::new();
    }
    let width = rows.iter().map(Vec::len).max().unwrap_or(0).max(1);
    let escape_cell = |cell: &String| cell.replace('|', "\\|").replace('\n', " ");
    let pad = |row: &Vec<String>| {
        let mut cells: Vec<String> = row.iter().map(escape_cell).collect();
        while cells.len() < width {
            cells.push(String::new());
        }
        cells
    };
    let header = pad(&rows[0]);
    let mut out = format!("| {} |\n| {} |\n", header.join(" | "), vec!["---"; width].join(" | "));
    for row in rows.iter().skip(1) {
        out.push_str(&format!("| {} |\n", pad(row).join(" | ")));
    }
    out
}

fn copy_import_file(source: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(source, destination)
        .map(|_| ())
        .map_err(|e| format!("Could not copy {}: {e}", source.display()))
}

fn write_import_text(destination: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(destination, content).map_err(|e| e.to_string())
}

fn is_importable_entry(entry: &walkdir::DirEntry, destination: &Path, skip_dirs: &[&str]) -> bool {
    if entry.depth() == 0 {
        return true;
    }
    let path = entry.path();
    if path == destination || path.starts_with(destination) {
        return false;
    }
    let name = entry.file_name().to_string_lossy();
    if is_ignored_name(&name) || skip_dirs.iter().any(|skip| name.eq_ignore_ascii_case(skip)) {
        return false;
    }
    true
}

fn import_tree(
    source: &Path,
    destination: &Path,
    text_to_markdown: bool,
    skip_dirs: &[&str],
) -> Result<(usize, usize), String> {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let walker = WalkDir::new(source)
        .into_iter()
        .filter_entry(|entry| is_importable_entry(entry, destination, skip_dirs));
    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let rel = match path.strip_prefix(source) {
            Ok(rel) => rel,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        let mut target = destination.join(rel);
        let is_text = text_to_markdown && ext == "txt";
        if is_text {
            target.set_extension("md");
        }
        if let Err(error) = copy_import_file(path, &target) {
            return Err(error);
        }
        if is_note(&target) {
            imported += 1;
        }
    }
    Ok((imported, skipped))
}

fn import_html_tree(source: &Path, destination: &Path) -> Result<(usize, usize), String> {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let walker = WalkDir::new(source)
        .into_iter()
        .filter_entry(|entry| is_importable_entry(entry, destination, &[]));
    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let rel = match path.strip_prefix(source) {
            Ok(rel) => rel,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        let target = destination.join(rel);
        if ext == "html" || ext == "htm" {
            let raw = fs::read_to_string(path)
                .map_err(|e| format!("Could not read {}: {e}", path.display()))?;
            let markdown = html2md::parse_html(&raw);
            let target = unique_path(
                target.parent().unwrap_or(destination),
                target
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Imported".into())
                    .as_str(),
                Some("md"),
            );
            write_import_text(&target, &markdown)?;
            imported += 1;
        } else if ext == "md" || ext == "markdown" {
            copy_import_file(path, &target)?;
            imported += 1;
        } else if !ext.is_empty() {
            copy_import_file(path, &target)?;
        }
    }
    Ok((imported, skipped))
}

fn import_notion_export(source: &Path, destination: &Path) -> Result<(usize, usize), String> {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let walker = WalkDir::new(source)
        .into_iter()
        .filter_entry(|entry| is_importable_entry(entry, destination, &[]));
    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let rel = match path.strip_prefix(source) {
            Ok(rel) => rel,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        let target = destination.join(rel);
        match ext.as_str() {
            "md" | "markdown" => {
                copy_import_file(path, &target)?;
                imported += 1;
            }
            "html" | "htm" => {
                let raw = fs::read_to_string(path)
                    .map_err(|e| format!("Could not read {}: {e}", path.display()))?;
                let markdown = html2md::parse_html(&raw);
                let target = unique_path(
                    target.parent().unwrap_or(destination),
                    target
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| "Imported".into())
                        .as_str(),
                    Some("md"),
                );
                write_import_text(&target, &markdown)?;
                imported += 1;
            }
            "csv" => {
                let raw = fs::read_to_string(path)
                    .map_err(|e| format!("Could not read {}: {e}", path.display()))?;
                let markdown = csv_to_markdown(&raw);
                let target = unique_path(
                    target.parent().unwrap_or(destination),
                    target
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| "Imported".into())
                        .as_str(),
                    Some("md"),
                );
                write_import_text(&target, &markdown)?;
                imported += 1;
            }
            _ => {
                copy_import_file(path, &target)?;
            }
        }
    }
    Ok((imported, skipped))
}

fn import_evernote(source: &Path, destination: &Path) -> Result<(usize, usize), String> {
    if !source.is_file() {
        return Err("Choose an .enex file exported from Evernote".into());
    }
    let raw = fs::read_to_string(source).map_err(|e| format!("Could not read the export: {e}"))?;
    let note_re = Regex::new(r"(?is)<note>(.*?)</note>").map_err(|e| e.to_string())?;
    let title_re = Regex::new(r"(?is)<title>(.*?)</title>").map_err(|e| e.to_string())?;
    let content_re = Regex::new(r"(?is)<content>(.*?)</content>").map_err(|e| e.to_string())?;
    let mut imported = 0usize;
    for note in note_re.captures_iter(&raw) {
        let body = note.get(1).map(|m| m.as_str()).unwrap_or("");
        let title = title_re
            .captures(body)
            .and_then(|cap| cap.get(1))
            .map(|m| xml_unescape(m.as_str()).trim().to_string())
            .filter(|title| !title.is_empty())
            .unwrap_or_else(|| "Untitled note".to_string());
        let content = content_re
            .captures(body)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        let clean = content
            .replace("<![CDATA[", "")
            .replace("]]>", "");
        let clean = if let (Some(start), Some(end)) = (clean.find("<en-note"), clean.rfind("</en-note>")) {
            &clean[start..end + "</en-note>".len()]
        } else {
            clean.as_str()
        };
        let markdown = html2md::parse_html(clean);
        let path = unique_path(destination, &sanitize_name(&title), Some("md"));
        fs::write(&path, markdown).map_err(|e| e.to_string())?;
        imported += 1;
    }
    if imported == 0 {
        return Err("No notes were found in that Evernote export".into());
    }
    Ok((imported, 0))
}

#[tauri::command]
fn import_vault(
    kind: String,
    source: String,
    parent: String,
    name: String,
) -> Result<ImportResult, String> {
    let source_path = PathBuf::from(&source);
    if !source_path.exists() {
        return Err("The selected source does not exist".into());
    }
    let parent_path = PathBuf::from(&parent);
    if !parent_path.is_dir() {
        return Err("Choose a folder for the imported vault".into());
    }
    let destination = unique_path(&parent_path, &sanitize_name(&name), None);
    fs::create_dir_all(&destination).map_err(|e| format!("Could not create the vault: {e}"))?;

    let result = match kind.as_str() {
        "obsidian" => import_tree(&source_path, &destination, false, &[]),
        "logseq" => import_tree(&source_path, &destination, false, &["logseq"]),
        "markdown" => import_tree(&source_path, &destination, false, &[]),
        "text" => import_tree(&source_path, &destination, true, &[]),
        "html" => import_html_tree(&source_path, &destination),
        "notion" => import_notion_export(&source_path, &destination),
        "evernote" => import_evernote(&source_path, &destination),
        _ => Err("Unknown import format".to_string()),
    };

    match result {
        Ok((imported, skipped)) => Ok(ImportResult {
            path: norm(&destination),
            imported,
            skipped,
        }),
        Err(error) => {
            let _ = fs::remove_dir_all(&destination);
            Err(error)
        }
    }
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

#[tauri::command]
fn is_android() -> bool {
    cfg!(target_os = "android")
}

/// App-private vault used by the Android build on first launch.
#[tauri::command]
fn android_vault(app: AppHandle) -> Result<Option<String>, String> {
    if !cfg!(target_os = "android") {
        return Ok(None);
    }
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    let vault = data.join("vault");
    fs::create_dir_all(&vault).map_err(|error| format!("Could not create vault: {error}"))?;
    let welcome = vault.join("Welcome.md");
    if !welcome.exists() {
        fs::write(
            &welcome,
            "# Welcome to Glowstone\n\nThis vault is stored safely inside the app.\n\n- Use the ribbon to open the graph, canvas and bases.\n- Type `[[` to link another note.\n- Paste or drop images to keep them in `attachments/`.\n",
        )
        .map_err(|error| format!("Could not create welcome note: {error}"))?;
    }
    let canonical = fs::canonicalize(&vault).map_err(|error| error.to_string())?;
    Ok(Some(norm(&canonical)))
}

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
            is_android,
            android_vault,
            ensure_vault_folder,
            save_attachment,
            copy_attachment,
            search_vault,
            get_graph,
            import_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glowstone");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let unique = format!(
            "glowstone-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let dir = std::env::temp_dir().join(unique);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn imports_markdown_tree_and_skips_obsidian_settings() {
        let root = scratch("obsidian");
        let source = root.join("source");
        fs::create_dir_all(source.join(".obsidian")).unwrap();
        fs::create_dir_all(source.join("attachments")).unwrap();
        fs::write(source.join("Note.md"), "# Hello").unwrap();
        fs::write(source.join(".obsidian/app.json"), "{}").unwrap();
        fs::write(source.join("attachments/image.png"), [0u8, 1, 2]).unwrap();
        let destination = root.join("vault");
        fs::create_dir_all(&destination).unwrap();

        let (imported, _) = import_tree(&source, &destination, false, &[]).unwrap();
        assert_eq!(imported, 1);
        assert!(destination.join("Note.md").is_file());
        assert!(destination.join("attachments/image.png").is_file());
        assert!(!destination.join(".obsidian").exists());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn converts_text_and_html_notes() {
        let root = scratch("convert");
        let source = root.join("source");
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::write(source.join("plain.txt"), "plain text").unwrap();
        fs::write(
            source.join("nested/page.html"),
            "<html><body><h1>Hello</h1><p>World</p></body></html>",
        )
        .unwrap();
        let destination = root.join("vault");
        fs::create_dir_all(&destination).unwrap();

        let (imported, _) = import_tree(&source, &destination, true, &[]).unwrap();
        assert_eq!(imported, 1);
        assert!(destination.join("plain.md").is_file());

        let (converted, _) = import_html_tree(&source, &destination).unwrap();
        assert!(converted >= 1);
        let html_note = destination.join("nested/page.md");
        assert!(html_note.is_file());
        let text = fs::read_to_string(html_note).unwrap();
        assert!(text.contains("Hello"));
        assert!(text.contains("World"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn imports_notion_csv_and_evernote() {
        let root = scratch("notion");
        let source = root.join("source");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("Database.csv"), "Name,Status\nAlpha,Done\n").unwrap();
        fs::write(source.join("Page.html"), "<h2>Page</h2>").unwrap();
        let destination = root.join("vault");
        fs::create_dir_all(&destination).unwrap();

        let (imported, _) = import_notion_export(&source, &destination).unwrap();
        assert_eq!(imported, 2);
        let table = fs::read_to_string(destination.join("Database.md")).unwrap();
        assert!(table.contains("| Name | Status |"));
        assert!(table.contains("| Alpha | Done |"));

        let enex = root.join("export.enex");
        fs::write(
            &enex,
            r#"<en-export><note><title>My note</title><content><![CDATA[<?xml version="1.0"?><en-note><div>Hello Evernote</div></en-note>]]></content></note></en-export>"#,
        )
        .unwrap();
        let (imported, _) = import_evernote(&enex, &destination).unwrap();
        assert_eq!(imported, 1);
        let note = fs::read_to_string(destination.join("My note.md")).unwrap();
        assert!(note.contains("Hello Evernote"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn search_handles_long_unicode_lines_without_panicking() {
        let root = scratch("search");
        let vault = root.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let long = format!("{} needle", "🦀".repeat(400));
        fs::write(vault.join("Long.md"), format!("{long}\nsecond line needle\n")).unwrap();
        let results = search_vault(vault.to_string_lossy().to_string(), "needle".into(), false).unwrap();
        assert_eq!(results.len(), 1);
        assert!(!results[0].matches.is_empty());
        assert!(results[0].matches[0].text.chars().count() <= 301);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn attachment_commands_stay_inside_the_vault() {
        let root = scratch("attachments");
        let vault = root.join("vault");
        fs::create_dir_all(&vault).unwrap();

        let folder = ensure_vault_folder(
            vault.to_string_lossy().to_string(),
            "notes/assets".into(),
        )
        .unwrap();
        assert!(Path::new(&folder).is_dir());

        let saved = save_attachment(
            vault.to_string_lossy().to_string(),
            "notes/assets".into(),
            "picture one.png".into(),
            BASE64.encode([0u8, 1, 2, 3]),
        )
        .unwrap();
        assert_eq!(fs::read(&saved).unwrap(), vec![0, 1, 2, 3]);
        assert!(saved.starts_with(folder.as_str()));

        // Saving the same name must not overwrite the existing file.
        let again = save_attachment(
            vault.to_string_lossy().to_string(),
            "notes/assets".into(),
            "picture one.png".into(),
            BASE64.encode([9u8]),
        )
        .unwrap();
        assert_ne!(saved, again);
        assert_eq!(fs::read(&saved).unwrap(), vec![0, 1, 2, 3]);

        // Names that would escape the folder or hide the file are neutralised.
        let neutral = save_attachment(
            vault.to_string_lossy().to_string(),
            "notes/assets".into(),
            "..".into(),
            BASE64.encode([5u8]),
        )
        .unwrap();
        assert_eq!(Path::new(&neutral).parent().unwrap(), Path::new(&folder));
        assert_eq!(Path::new(&neutral).file_name().unwrap(), "Untitled");

        // Files saved without an extension still report their real image type.
        let unknown = vault.join("blob");
        fs::write(
            &unknown,
            [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0],
        )
        .unwrap();
        let data = read_attachment(
            vault.to_string_lossy().to_string(),
            unknown.to_string_lossy().to_string(),
        )
        .unwrap();
        assert!(data.starts_with("data:image/png;base64,"));

        let source = root.join("external.png");
        fs::write(&source, [7u8, 7]).unwrap();
        assert!(read_attachment(
            vault.to_string_lossy().to_string(),
            source.to_string_lossy().to_string(),
        )
        .is_err());
        let copied = copy_attachment(
            vault.to_string_lossy().to_string(),
            "".into(),
            source.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(fs::read(&copied).unwrap(), vec![7, 7]);

        assert!(ensure_vault_folder(vault.to_string_lossy().to_string(), "../escape".into()).is_err());
        assert!(save_attachment(
            vault.to_string_lossy().to_string(),
            "../escape".into(),
            "x.png".into(),
            BASE64.encode([1u8]),
        )
        .is_err());

        fs::remove_dir_all(root).ok();
    }
}
