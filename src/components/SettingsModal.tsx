import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FolderClosed,
  Info,
  Palette,
  HardDrive,
  Monitor,
  PenLine,
  Keyboard,
  KeyRound,
  Plug,
  Puzzle,
  Search,
  CircleUser,
  CalendarDays,
  FileClock,
  Combine,
  Link2,
  TerminalSquare,
  Eye,
  RefreshCw,
  Frame,
  Table2,
  Star,
  Waypoints,
  LayoutTemplate,
} from "lucide-react";
import { Modal } from "./Modal";
import { useAppStore, type SettingsSection } from "../store";
import { flattenNotes } from "../lib/utils";
import { useT } from "../lib/useT";
import { isAndroid } from "../lib/api";
import { CORE_PLUGINS, pluginEnabled, togglePlugin } from "../lib/plugins";
import logo from "../assets/logo.png";

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`setting-row setting-toggle-row ${disabled ? "is-disabled" : ""}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <span className="setting-copy">
        <span className="setting-label">{label}</span>
        {description && <span className="setting-description">{description}</span>}
      </span>
      <span className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked}>
        <span className="switch-knob" />
      </span>
    </button>
  );
}

interface Option {
  value: string;
  label: string;
}

function SelectSetting({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`setting-row setting-control-row ${disabled ? "is-disabled" : ""}`}>
      <span className="setting-copy">
        <span className="setting-label">{label}</span>
        {description && <span className="setting-description">{description}</span>}
      </span>
      <span className="setting-select-wrap">
        <select
          className="setting-select"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function TextSetting({
  label,
  description,
  value,
  placeholder,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`setting-row setting-control-row ${disabled ? "is-disabled" : ""}`}>
      <span className="setting-copy">
        <span className="setting-label">{label}</span>
        {description && <span className="setting-description">{description}</span>}
      </span>
      <input
        className="setting-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

const pluginIcon = (id: string) => {
  switch (id) {
    case "quick-switcher":
      return <Search size={16} />;
    case "file-recovery":
      return <FileClock size={16} />;
    case "daily-notes":
      return <CalendarDays size={16} />;
    case "note-composer":
      return <Combine size={16} />;
    case "backlinks":
      return <Link2 size={16} />;
    case "command-palette":
      return <TerminalSquare size={16} />;
    case "page-preview":
      return <Eye size={16} />;
    case "sync":
      return <RefreshCw size={16} />;
    case "canvas":
      return <Frame size={16} />;
    case "bases":
      return <Table2 size={16} />;
    case "bookmarks":
      return <Star size={16} />;
    case "graph":
      return <Waypoints size={16} />;
    case "templates":
      return <LayoutTemplate size={16} />;
    default:
      return <Plug size={16} />;
  }
};

export function SettingsModal() {
  const t = useT();
  const open = useAppStore((s) => s.settingsOpen);
  const section = useAppStore((s) => s.settingsSection);
  const setSection = useAppStore((s) => s.openSettings);
  const close = useAppStore((s) => s.closeSettings);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const vault = useAppStore((s) => s.vault);
  const chooseVault = useAppStore((s) => s.chooseVault);
  const closeVault = useAppStore((s) => s.closeVault);
  const openImport = useAppStore((s) => s.openImport);
  const openVaults = useAppStore((s) => s.openVaults);
  const tree = useAppStore((s) => s.tree);
  const [query, setQuery] = useState("");

  const noteOptions = useMemo<Option[]>(() => {
    const notes = flattenNotes(tree)
      .map((note) => ({
        value: note.path,
        label: note.folder ? `${note.folder}/${note.title}` : note.title,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "", label: t("Select a file…") }, ...notes];
  }, [tree, t, settings.language]);

  const [fontSize, setFontSize] = useState(settings.fontSize);
  useEffect(() => {
    if (open) setFontSize(settings.fontSize);
  }, [open, settings.fontSize]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const nav: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: t("General"), icon: <CircleUser size={16} /> },
    { id: "appearance", label: t("Appearance"), icon: <Palette size={16} /> },
    { id: "interface", label: t("Interface"), icon: <Monitor size={16} /> },
    { id: "editor", label: t("Editor"), icon: <PenLine size={16} /> },
    { id: "files", label: t("Files & links"), icon: <FolderClosed size={16} /> },
    { id: "hotkeys", label: t("Hotkeys"), icon: <Keyboard size={16} /> },
    { id: "keychain", label: t("Keychain"), icon: <KeyRound size={16} /> },
    { id: "core-plugins", label: t("Core plugins"), icon: <Plug size={16} /> },
    { id: "community-plugins", label: t("Community plugins"), icon: <Puzzle size={16} /> },
    { id: "about", label: t("About"), icon: <Info size={16} /> },
  ];
  const filtering = query.trim().length > 0;
  const visibleNav = filtering
    ? nav.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
    : nav;
  const visiblePlugins = CORE_PLUGINS.filter((plugin) => {
    if (!filtering) return true;
    const text = `${t(plugin.label)} ${t(plugin.description)}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

  const showResults = filtering && visibleNav.length === 0 && visiblePlugins.length === 0;

  return (
    <Modal open={open} onClose={close} title={t("Settings")} width={860} className="settings-modal">
      <div className="settings-layout">
        <nav className="settings-nav">
          <label className="settings-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search settings…")}
              spellCheck={false}
            />
          </label>
          <div className="settings-nav-group">
            {visibleNav.map((item) => (
              <button
                key={item.id}
                className={`settings-nav-item ${section === item.id ? "active" : ""}`}
                onClick={() => setSection(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          {filtering && visiblePlugins.length > 0 && (
            <>
              <div className="settings-nav-caption">{t("Core plugins")}</div>
              <div className="settings-nav-group">
                {visiblePlugins.map((plugin) => (
                  <button
                    key={plugin.id}
                    className="settings-nav-item"
                    onClick={() => setSection("core-plugins")}
                  >
                    {pluginIcon(plugin.id)}
                    <span>{t(plugin.label)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </nav>

        <div className="settings-content">
          {showResults && <div className="settings-no-results">{t("No settings found")}</div>}

          {!showResults && section === "general" && (
            <>
              <h3>{t("General")}</h3>
              <SelectSetting
                label={t("Language")}
                description={t("Choose the language of the interface.")}
                value={settings.language}
                options={[
                  { value: "en", label: "English" },
                  { value: "ru", label: "Русский" },
                ]}
                onChange={(value) =>
                  updateSettings({ language: value === "ru" ? "ru" : "en" })
                }
              />
              <div className="setting-divider" />
              <SelectSetting
                label={t("Default file to open")}
                description={t("Choose which file to open when the app starts.")}
                value={settings.defaultFileToOpen}
                options={[
                  { value: "last", label: t("Last opened file") },
                  { value: "new", label: t("New tab") },
                  { value: "specific", label: t("Specific file") },
                ]}
                onChange={(value) =>
                  updateSettings({ defaultFileToOpen: value as typeof settings.defaultFileToOpen })
                }
              />
              <SelectSetting
                label={t("File to open")}
                description={t("Select a specific file to open by default.")}
                value={settings.defaultFile}
                options={noteOptions}
                onChange={(value) =>
                  updateSettings({
                    defaultFile: value,
                    ...(value ? { defaultFileToOpen: "specific" as const } : {}),
                  })
                }
              />
              <div className="setting-divider" />
              <div className="setting-block">
                <div className="setting-label">{t("Current vault")}</div>
                {vault ? (
                  <div className="vault-setting">
                    <div className="vault-setting-icon">
                      <HardDrive size={18} />
                    </div>
                    <div className="vault-setting-copy">
                      <div className="vault-setting-name">{vault.name}</div>
                      <div className="vault-setting-path" title={vault.path}>
                        {vault.path}
                      </div>
                    </div>
                    {!isAndroid() && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          close();
                          void chooseVault();
                        }}
                      >
                        {t("Switch…")}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="setting-description">{t("No vault is currently open.")}</p>
                )}
                {isAndroid() ? (
                  <p className="setting-description">
                    {t("This vault is stored in the app's private storage.")}
                  </p>
                ) : (
                  <div className="setting-button-row">
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        close();
                        void chooseVault();
                      }}
                    >
                      {t("Open another vault…")}
                    </button>
                    <button className="btn btn-secondary" onClick={openVaults}>
                      {t("Manage vaults…")}
                    </button>
                    <button className="btn btn-secondary" onClick={openImport}>
                      {t("Import notes…")}
                    </button>
                    {vault && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          close();
                          void closeVault();
                        }}
                      >
                        {t("Close vault")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {!showResults && section === "appearance" && (
            <>
              <h3>{t("Appearance")}</h3>
              <div className="setting-block">
                <div className="setting-label">{t("Theme")}</div>
                <div className="setting-description">{t("Use dark or light appearance.")}</div>
                <div className="theme-grid">
                  <button
                    className={`theme-card ${settings.theme === "dark" ? "active" : ""}`}
                    onClick={() => updateSettings({ theme: "dark" })}
                  >
                    <span className="theme-preview theme-dark">
                      <span className="theme-preview-sidebar" />
                      <span className="theme-preview-main">
                        <span />
                        <span />
                        <span />
                      </span>
                    </span>
                    <span className="theme-card-label">
                      {t("Dark")}
                      {settings.theme === "dark" && <Check size={14} />}
                    </span>
                  </button>
                  <button
                    className={`theme-card ${settings.theme === "light" ? "active" : ""}`}
                    onClick={() => updateSettings({ theme: "light" })}
                  >
                    <span className="theme-preview theme-light">
                      <span className="theme-preview-sidebar" />
                      <span className="theme-preview-main">
                        <span />
                        <span />
                        <span />
                      </span>
                    </span>
                    <span className="theme-card-label">
                      {t("Light")}
                      {settings.theme === "light" && <Check size={14} />}
                    </span>
                  </button>
                </div>
              </div>

              <div className="setting-block">
                <div className="setting-label">{t("Accent")}</div>
                <div className="setting-description">
                  {t("Glowstone uses the warm glow of its logo.")}
                </div>
                <div className="accent-row">
                  <span className="accent-swatch" />
                  <span>{t("Glowstone gold")}</span>
                </div>
              </div>

              <div className="setting-row">
                <span className="setting-copy">
                  <span className="setting-label">{t("Editor font size")}</span>
                  <span className="setting-description">{t("Text size inside the editor and reading view.")}</span>
                </span>
                <span className="range-value">{fontSize}px</span>
              </div>
              <input
                className="settings-range"
                type="range"
                min={12}
                max={24}
                step={1}
                value={fontSize}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setFontSize(value);
                  updateSettings({ fontSize: value });
                }}
              />

              <Toggle
                checked={settings.readableLineLength}
                onChange={(value) => updateSettings({ readableLineLength: value })}
                label={t("Readable line length")}
                description={t("Limit line width for easier reading.")}
              />
            </>
          )}

          {!showResults && section === "interface" && (
            <>
              <h3>{t("Interface")}</h3>
              <Toggle
                checked={settings.showRibbon}
                onChange={(value) => updateSettings({ showRibbon: value })}
                label={t("Show ribbon")}
                description={t("Show the left ribbon with quick actions.")}
              />
              <Toggle
                checked={settings.showStatusBar}
                onChange={(value) => updateSettings({ showStatusBar: value })}
                label={t("Show status bar")}
                description={t("Show the status bar at the bottom.")}
              />
              <div className="setting-divider" />
              <div className="setting-block">
                <div className="setting-label">{t("Ribbon")}</div>
                <div className="setting-description">
                  {t("The ribbon gives quick access to files, search, bookmarks, graph, canvas, daily notes, the command palette and bases.")}
                </div>
              </div>
            </>
          )}

          {!showResults && section === "editor" && (
            <>
              <h3>{t("Editor")}</h3>
              <Toggle
                checked={settings.autoSave}
                onChange={(value) => updateSettings({ autoSave: value })}
                label={t("Autosave")}
                description={t("Save changes automatically.")}
              />
              <Toggle
                checked={settings.spellcheck}
                onChange={(value) => updateSettings({ spellcheck: value })}
                label={t("Spellcheck")}
                description={t("Check spelling while typing.")}
              />
              <Toggle
                checked={settings.lineNumbers}
                onChange={(value) => updateSettings({ lineNumbers: value })}
                label={t("Show line numbers")}
                description={t("Show line numbers in the editor.")}
              />
              <div className="setting-divider" />
              <div className="setting-block">
                <div className="setting-label">{t("Markdown shortcuts")}</div>
                <div className="kbd-grid">
                  <span>{t("Bold")}</span>
                  <kbd>Ctrl + B</kbd>
                  <span>{t("Italic")}</span>
                  <kbd>Ctrl + I</kbd>
                  <span>{t("Link")}</span>
                  <kbd>Ctrl + K</kbd>
                  <span>{t("Reading view")}</span>
                  <kbd>Ctrl + E</kbd>
                  <span>{t("Quick switcher")}</span>
                  <kbd>Ctrl + O</kbd>
                  <span>{t("Command palette")}</span>
                  <kbd>Ctrl + P</kbd>
                </div>
              </div>
            </>
          )}

          {!showResults && section === "files" && (
            <>
              <h3>{t("Files & links")}</h3>
              <Toggle
                checked={settings.alwaysFocusNewTabs}
                onChange={(value) => updateSettings({ alwaysFocusNewTabs: value })}
                label={t("Always focus new tabs")}
                description={t("When you open a link in a new tab, switch to it immediately.")}
              />
              <SelectSetting
                label={t("Default location for new notes")}
                description={t("Where newly created notes are placed.")}
                value={settings.newNoteLocation}
                options={[
                  { value: "root", label: t("Vault root") },
                  { value: "current", label: t("Current folder") },
                  { value: "folder", label: t("Specified folder") },
                ]}
                onChange={(value) =>
                  updateSettings({ newNoteLocation: value as typeof settings.newNoteLocation })
                }
              />
              <TextSetting
                label={t("Folder to create new notes in")}
                description={t("Newly created notes will appear in this folder.")}
                value={settings.newNoteFolder}
                placeholder="Notes/Inbox"
                onChange={(value) => updateSettings({ newNoteFolder: value })}
              />
              <SelectSetting
                label={t("Default location for new attachments")}
                description={t("Where newly added attachments are placed.")}
                value={settings.attachmentLocation}
                options={[
                  { value: "root", label: t("Vault root") },
                  { value: "current", label: t("Current folder") },
                  { value: "subfolder", label: t("Subfolder of current") },
                  { value: "folder", label: t("Specified folder") },
                ]}
                onChange={(value) =>
                  updateSettings({ attachmentLocation: value as typeof settings.attachmentLocation })
                }
              />
              <TextSetting
                label={t("Attachment folder path")}
                description={t("Place newly created attachment files, such as images created via drag-and-drop or audio recordings, in this folder.")}
                value={settings.attachmentFolder}
                placeholder="attachments"
                onChange={(value) => updateSettings({ attachmentFolder: value })}
              />
              <div className="setting-divider" />
              <Toggle
                checked={settings.confirmDelete}
                onChange={(value) => updateSettings({ confirmDelete: value })}
                label={t("Confirm before deleting")}
                description={t("Ask for confirmation before a note or folder is permanently deleted.")}
              />
              <div className="setting-divider" />
              <div className="setting-block">
                <div className="setting-label">{t("Linked notes")}</div>
                <div className="setting-description">
                  {t("Use [[Note name]] to link notes. Glowstone resolves links by note name and keeps backlinks and the graph up to date as you type.")}
                </div>
              </div>
            </>
          )}

          {!showResults && section === "hotkeys" && (
            <>
              <h3>{t("Hotkeys")}</h3>
              <div className="setting-block">
                <div className="setting-description">{t("Customize keyboard shortcuts.")}</div>
                <div className="kbd-grid hotkey-grid">
                  <span>{t("Quick switcher")}</span>
                  <kbd>Ctrl + O</kbd>
                  <span>{t("Command palette")}</span>
                  <kbd>Ctrl + P</kbd>
                  <span>{t("Search in vault")}</span>
                  <kbd>Ctrl + Shift + F</kbd>
                  <span>{t("File explorer")}</span>
                  <kbd>Ctrl + Shift + E</kbd>
                  <span>{t("Graph view")}</span>
                  <kbd>Ctrl + Shift + G</kbd>
                  <span>{t("New note")}</span>
                  <kbd>Ctrl + N</kbd>
                  <span>{t("Reading view")}</span>
                  <kbd>Ctrl + E</kbd>
                  <span>{t("Toggle theme")}</span>
                  <kbd>Ctrl + Shift + D</kbd>
                </div>
                <div className="setting-description">{t("Coming later")}</div>
              </div>
            </>
          )}

          {!showResults && section === "keychain" && (
            <>
              <h3>{t("Keychain")}</h3>
              <div className="settings-stub">
                <KeyRound size={28} />
                <p>{t("Keychain is not available yet.")}</p>
                <span>{t("Coming soon")}</span>
              </div>
            </>
          )}

          {!showResults && section === "core-plugins" && (
            <>
              <h3>{t("Core plugins")}</h3>
              <div className="settings-plugin-list">
                {visiblePlugins.map((plugin) => {
                  const enabled = pluginEnabled(settings, plugin.id);
                  const comingSoon = plugin.id === "sync";
                  return (
                    <div className="settings-plugin" key={plugin.id}>
                      <span className="settings-plugin-icon">{pluginIcon(plugin.id)}</span>
                      <span className="settings-plugin-copy">
                        <span className="setting-label">{t(plugin.label)}</span>
                        <span className="setting-description">{t(plugin.description)}</span>
                      </span>
                      {comingSoon ? (
                        <span className="settings-badge">{t("Coming soon")}</span>
                      ) : (
                        <button
                          className={`switch ${enabled ? "on" : ""}`}
                          role="switch"
                          aria-checked={enabled}
                          onClick={() =>
                            updateSettings({
                              disabledPlugins: togglePlugin(settings, plugin.id),
                            })
                          }
                          aria-label={t(plugin.label)}
                        >
                          <span className="switch-knob" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="setting-divider" />
              <TextSetting
                label={t("Daily notes folder")}
                description={t("New daily notes are created in this folder.")}
                value={settings.dailyNoteFolder}
                placeholder="Daily"
                onChange={(value) => updateSettings({ dailyNoteFolder: value })}
              />
            </>
          )}

          {!showResults && section === "community-plugins" && (
            <>
              <h3>{t("Community plugins")}</h3>
              <div className="settings-stub">
                <Puzzle size={28} />
                <p>{t("Community plugins are not available yet.")}</p>
                <span>{t("Coming soon")}</span>
              </div>
            </>
          )}

          {!showResults && section === "about" && (
            <div className="about">
              <img src={logo} className="about-logo" alt="Glowstone" />
              <h3>Glowstone</h3>
              <div className="about-version">{t("Version {version}", { version: "0.1.0" })}</div>
              <p className="about-description">
                {t("A local-first Markdown knowledge base.")} {t("Your notes are plain .md files in a folder you own.")}
              </p>
              <div className="about-facts">
                <div>
                  <span>{t("Language")}</span>
                  <strong>{settings.language === "ru" ? "Русский" : "English"}</strong>
                </div>
                <div>
                  <span>{t("License")}</span>
                  <strong>MIT</strong>
                </div>
                <div>
                  <span>{t("Built with")}</span>
                  <strong>Rust · Tauri · React</strong>
                </div>
              </div>
              <p className="about-note">
                {t("Open source. No accounts, no cloud, no lock-in.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
