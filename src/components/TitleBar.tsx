import {
  ChevronDown,
  Folder,
  PanelLeft,
  Search,
  Settings,
  SquarePen,
  Plus,
  SunMoon,
  Info,
  FilePlus2,
  FolderPlus,
  Download,
  Layers,
  XCircle,
} from "lucide-react";
import { useAppStore } from "../store";
import { TabBar } from "./TabBar";
import { Popover } from "./Popover";
import { WindowControls } from "./WindowControls";
import { basename } from "../lib/utils";
import { isAndroid } from "../lib/api";
import { useT } from "../lib/useT";
import { plural } from "../lib/i18n";

export function TitleBar() {
  const t = useT();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const createNote = useAppStore((s) => s.createNote);
  const createFolder = useAppStore((s) => s.createFolder);
  const vault = useAppStore((s) => s.vault);
  const settings = useAppStore((s) => s.settings);
  const chooseVault = useAppStore((s) => s.chooseVault);
  const createVault = useAppStore((s) => s.createVault);
  const openVaultByPath = useAppStore((s) => s.openVaultByPath);
  const closeVault = useAppStore((s) => s.closeVault);
  const openSettings = useAppStore((s) => s.openSettings);
  const openImport = useAppStore((s) => s.openImport);
  const openVaults = useAppStore((s) => s.openVaults);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const refreshTree = useAppStore((s) => s.refreshTree);
  const refreshGraph = useAppStore((s) => s.refreshGraph);

  const mobile = isAndroid();
  const leftWidth = mobile ? 148 : sidebarOpen ? Math.max(148, 48 + sidebarWidth) : 148;

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" style={{ width: leftWidth }} data-tauri-drag-region>
        <button
          className="titlebar-button"
          onClick={toggleSidebar}
          title={t("Toggle sidebar")}
          aria-label={t("Toggle sidebar")}
        >
          <PanelLeft size={17} />
        </button>
        <Popover
          align="left"
          width={300}
          trigger={({ toggle, open }) => (
            <button
              className={`titlebar-button ${open ? "active" : ""}`}
              onClick={toggle}
              title={vault ? t("Vault: {name}", { name: vault.name }) : t("Vault menu")}
              aria-label={t("Vault menu")}
            >
              <Folder size={17} />
              <ChevronDown size={11} className="titlebar-caret" />
            </button>
          )}
        >
          {(close) => (
            <div className="vault-menu">
              <div className="vault-menu-current">
                <div className="vault-menu-icon">
                  <Folder size={18} />
                </div>
                <div className="vault-menu-meta">
                  <div className="vault-menu-name">{vault?.name ?? t("No vault")}</div>
                  <div className="vault-menu-path" title={vault?.path}>
                    {vault?.path}
                  </div>
                </div>
              </div>
              <div className="vault-menu-stats">
                {vault?.noteCount ?? 0}{" "}
                {plural(vault?.noteCount ?? 0, { en: ["note", "notes"], ru: ["заметка", "заметки", "заметок"] })}
              </div>
              <div className="menu-separator" />
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  void createNote();
                }}
              >
                <FilePlus2 size={15} />
                <span>{t("New note")}</span>
                <span className="menu-shortcut">Ctrl N</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  void createFolder();
                }}
              >
                <FolderPlus size={15} />
                <span>{t("New folder")}</span>
              </button>
              <div className="menu-separator" />
              {!mobile && (
                <>
                  <button
                    className="menu-item"
                    onClick={() => {
                      close();
                      void chooseVault();
                    }}
                  >
                    <span className="menu-icon-spacer" />
                    <span>{t("Open another vault…")}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      close();
                      void createVault();
                    }}
                  >
                    <Plus size={15} />
                    <span>{t("Create new vault…")}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      close();
                      openVaults();
                    }}
                  >
                    <Layers size={15} />
                    <span>{t("Manage vaults…")}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      close();
                      openImport();
                    }}
                  >
                    <Download size={15} />
                    <span>{t("Import notes…")}</span>
                  </button>
                </>
              )}
              {settings.recentVaults.filter((path) => path !== vault?.path).length > 0 && (
                <>
                  <div className="menu-label">{t("Recent vaults")}</div>
                  {settings.recentVaults
                    .filter((path) => path !== vault?.path)
                    .slice(0, 5)
                    .map((path) => (
                      <button
                        key={path}
                        className="menu-item menu-recent"
                        title={path}
                        onClick={() => {
                          close();
                          void openVaultByPath(path);
                        }}
                      >
                        <Folder size={14} />
                        <span>{basename(path)}</span>
                        <span className="menu-recent-path">{path.replace(/^.*\/(?=[^/]+\/?$)/, "")}</span>
                      </button>
                    ))}
                </>
              )}
              <div className="menu-separator" />
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  void refreshTree();
                  void refreshGraph();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>{t("Refresh vault")}</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  openSettings("files");
                }}
              >
                <Settings size={15} />
                <span>{t("Settings")}</span>
                <span className="menu-shortcut">Ctrl ,</span>
              </button>
              <button
                className="menu-item menu-danger"
                onClick={() => {
                  close();
                  void closeVault();
                }}
              >
                <XCircle size={15} />
                <span>{t("Close vault")}</span>
              </button>
            </div>
          )}
        </Popover>
        <button
          className="titlebar-button"
          onClick={() => setSidebarView("search")}
          title={`${t("Search")} (Ctrl+Shift+F)`}
          aria-label={t("Search")}
        >
          <Search size={17} />
        </button>
        <button
          className="titlebar-button"
          onClick={() => void createNote()}
          title={`${t("New note")} (Ctrl+N)`}
          aria-label={t("New note")}
        >
          <SquarePen size={17} />
        </button>
      </div>

      <TabBar />

      <div className="titlebar-right">
        <Popover
          align="right"
          width={220}
          trigger={({ toggle, open }) => (
            <button
              className={`titlebar-button titlebar-menu-button ${open ? "active" : ""}`}
              onClick={toggle}
              title={t("Application menu")}
              aria-label={t("Application menu")}
            >
              <ChevronDown size={16} />
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  openSettings();
                }}
              >
                <Settings size={15} />
                <span>{t("Settings")}</span>
                <span className="menu-shortcut">Ctrl ,</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  toggleTheme();
                }}
              >
                <SunMoon size={15} />
                <span>{t("Toggle theme")}</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  openSettings("about");
                }}
              >
                <Info size={15} />
                <span>{t("About Glowstone")}</span>
              </button>
              <div className="menu-separator" />
              {!mobile && (
                <>
                  <button
                    className="menu-item"
                    onClick={() => {
                      close();
                      openVaults();
                    }}
                  >
                    <Layers size={15} />
                    <span>{t("Manage vaults…")}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      close();
                      openImport();
                    }}
                  >
                    <Download size={15} />
                    <span>{t("Import notes…")}</span>
                  </button>
                </>
              )}
              <div className="menu-separator" />
              <button
                className="menu-item menu-danger"
                onClick={() => {
                  close();
                  void closeVault();
                }}
              >
                <XCircle size={15} />
                <span>{t("Close vault")}</span>
              </button>
            </>
          )}
        </Popover>
        <WindowControls />
      </div>
    </header>
  );
}
