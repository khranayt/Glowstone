import { useEffect, useState } from "react";
import {
  Check,
  FolderClosed,
  Info,
  Palette,
  Type,
  ExternalLink,
  HardDrive,
} from "lucide-react";
import { Modal } from "./Modal";
import { useAppStore, type SettingsSection } from "../store";
import logo from "../assets/logo.png";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button className="setting-row setting-toggle-row" onClick={() => onChange(!checked)}>
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

export function SettingsModal() {
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

  const [fontSize, setFontSize] = useState(settings.fontSize);
  useEffect(() => {
    if (open) setFontSize(settings.fontSize);
  }, [open, settings.fontSize]);

  const nav: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
    { id: "editor", label: "Editor", icon: <Type size={16} /> },
    { id: "files", label: "Files & links", icon: <FolderClosed size={16} /> },
    { id: "about", label: "About", icon: <Info size={16} /> },
  ];

  return (
    <Modal open={open} onClose={close} title="Settings" width={780} className="settings-modal">
      <div className="settings-layout">
        <nav className="settings-nav">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`settings-nav-item ${section === item.id ? "active" : ""}`}
              onClick={() => setSection(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === "appearance" && (
            <>
              <h3>Appearance</h3>
              <div className="setting-block">
                <div className="setting-label">Theme</div>
                <div className="setting-description">Choose how Glowstone looks.</div>
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
                      Dark
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
                      Light
                      {settings.theme === "light" && <Check size={14} />}
                    </span>
                  </button>
                </div>
              </div>

              <div className="setting-block">
                <div className="setting-label">Accent</div>
                <div className="setting-description">Glowstone uses the warm glow of its logo.</div>
                <div className="accent-row">
                  <span className="accent-swatch" />
                  <span>Glowstone gold</span>
                </div>
              </div>

              <div className="setting-row">
                <span className="setting-copy">
                  <span className="setting-label">Editor font size</span>
                  <span className="setting-description">Text size inside the editor and reading view.</span>
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
                label="Readable line length"
                description="Keep lines at a comfortable width for reading and writing."
              />
            </>
          )}

          {section === "editor" && (
            <>
              <h3>Editor</h3>
              <Toggle
                checked={settings.autoSave}
                onChange={(value) => updateSettings({ autoSave: value })}
                label="Auto save"
                description="Save your notes automatically shortly after you stop typing."
              />
              <Toggle
                checked={settings.spellcheck}
                onChange={(value) => updateSettings({ spellcheck: value })}
                label="Check spelling"
                description="Underline misspelled words using the system spellchecker."
              />
              <Toggle
                checked={settings.lineNumbers}
                onChange={(value) => updateSettings({ lineNumbers: value })}
                label="Line numbers"
                description="Show line numbers in the editor gutter."
              />
              <div className="setting-divider" />
              <div className="setting-block">
                <div className="setting-label">Formatting toolbar</div>
                <div className="setting-description">
                  The toolbar above the editor is always available while editing. Use it for headings,
                  bold and italic text, links, tables, tasks and more.
                </div>
              </div>
              <div className="setting-block">
                <div className="setting-label">Markdown shortcuts</div>
                <div className="kbd-grid">
                  <span>Bold</span>
                  <kbd>Ctrl + B</kbd>
                  <span>Italic</span>
                  <kbd>Ctrl + I</kbd>
                  <span>Link</span>
                  <kbd>Ctrl + K</kbd>
                  <span>Reading view</span>
                  <kbd>Ctrl + E</kbd>
                  <span>Quick switcher</span>
                  <kbd>Ctrl + O</kbd>
                  <span>Command palette</span>
                  <kbd>Ctrl + P</kbd>
                </div>
              </div>
            </>
          )}

          {section === "files" && (
            <>
              <h3>Files & links</h3>
              <Toggle
                checked={settings.confirmDelete}
                onChange={(value) => updateSettings({ confirmDelete: value })}
                label="Confirm before deleting"
                description="Ask for confirmation before a note or folder is permanently deleted."
              />
              <div className="setting-divider" />
              <div className="setting-block">
                <div className="setting-label">Current vault</div>
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
                    <button className="btn btn-secondary" onClick={() => void chooseVault()}>
                      Switch…
                    </button>
                  </div>
                ) : (
                  <p className="setting-description">No vault is currently open.</p>
                )}
                <div className="setting-button-row">
                  <button className="btn btn-secondary" onClick={() => void chooseVault()}>
                    Open another vault…
                  </button>
                  <button className="btn btn-secondary" onClick={openVaults}>
                    Manage vaults…
                  </button>
                  <button className="btn btn-secondary" onClick={openImport}>
                    Import notes…
                  </button>
                  {vault && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        close();
                        void closeVault();
                      }}
                    >
                      Close vault
                    </button>
                  )}
                </div>
              </div>
              <div className="setting-block">
                <div className="setting-label">Linked notes</div>
                <div className="setting-description">
                  Use <code>[[Note name]]</code> to link notes. Glowstone resolves links by note name and
                  keeps backlinks and the graph up to date as you type.
                </div>
              </div>
            </>
          )}

          {section === "about" && (
            <div className="about">
              <img src={logo} className="about-logo" alt="Glowstone" />
              <h3>Glowstone</h3>
              <div className="about-version">Version 0.1.0</div>
              <p className="about-description">
                A local-first Markdown knowledge base with tabs, live preview, backlinks and a
                force-directed graph. Your notes are plain <code>.md</code> files in a folder you own.
              </p>
              <div className="about-facts">
                <div>
                  <span>Language</span>
                  <strong>English</strong>
                </div>
                <div>
                  <span>License</span>
                  <strong>MIT</strong>
                </div>
                <div>
                  <span>Built with</span>
                  <strong>Rust · Tauri · React</strong>
                </div>
              </div>
              <p className="about-note">
                Open source. No accounts, no cloud, no lock-in.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
