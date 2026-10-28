import { FolderOpen, Loader2, Plus, Clock, Download, Layers } from "lucide-react";
import logo from "../assets/logo.png";
import { useAppStore } from "../store";
import { WindowControls } from "./WindowControls";
import { basename } from "../lib/utils";
import { useT } from "../lib/useT";
import { isAndroid } from "../lib/api";

export function Welcome() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const chooseVault = useAppStore((s) => s.chooseVault);
  const createVault = useAppStore((s) => s.createVault);
  const openVaultByPath = useAppStore((s) => s.openVaultByPath);
  const openImport = useAppStore((s) => s.openImport);
  const openVaults = useAppStore((s) => s.openVaults);
  const openAndroidVault = useAppStore((s) => s.openAndroidVault);
  const initializing = useAppStore((s) => s.initializing);

  return (
    <div className="welcome">
      <div className="welcome-titlebar" data-tauri-drag-region>
        <div className="welcome-brand" data-tauri-drag-region>
          <img src={logo} alt="" />
          <span>Glowstone</span>
        </div>
        <WindowControls />
      </div>

      <div className="welcome-content">
        <img className="welcome-logo" src={logo} alt="Glowstone logo" />
        <h1>Glowstone</h1>
        <p className="welcome-tagline">{t("Your notes, connected.")} {t("Local-first Markdown knowledge base.")}</p>

        <div className="welcome-actions">
          {isAndroid() ? (
            <button
              className="welcome-button primary"
              onClick={() => void openAndroidVault()}
              disabled={initializing}
            >
              <FolderOpen size={18} />
              {t("Start with a local vault")}
            </button>
          ) : (
            <>
              <button className="welcome-button primary" onClick={() => void chooseVault()} disabled={initializing}>
                <FolderOpen size={18} />
                {t("Open folder as vault")}
              </button>
              <button className="welcome-button" onClick={() => void createVault()} disabled={initializing}>
                <Plus size={18} />
                {t("Create new vault")}
              </button>
              <button className="welcome-button" onClick={openImport} disabled={initializing}>
                <Download size={18} />
                {t("Import notes")}
              </button>
              <button className="welcome-button" onClick={openVaults} disabled={initializing}>
                <Layers size={18} />
                {t("Manage vaults")}
              </button>
            </>
          )}
        </div>

        {initializing && (
          <div className="welcome-loading">
            <Loader2 size={16} className="spin" />
            {t("Opening vault…")}
          </div>
        )}

        {settings.recentVaults.length > 0 && (
          <div className="welcome-recents">
            <div className="welcome-recents-title">
              <Clock size={13} />
              {t("Recent vaults")}
            </div>
            <div className="welcome-recent-list">
              {settings.recentVaults.slice(0, 6).map((path) => (
                <button
                  key={path}
                  className="welcome-recent"
                  onClick={() => void openVaultByPath(path)}
                  title={path}
                >
                  <span className="welcome-recent-name">{basename(path)}</span>
                  <span className="welcome-recent-path">{path}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="welcome-footer">
          {t("Open source · Your notes stay on your device · Markdown files you own")}
        </p>
      </div>
    </div>
  );
}
