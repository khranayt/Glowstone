import { FolderOpen, Loader2, Plus, Clock } from "lucide-react";
import logo from "../assets/logo.png";
import { useAppStore } from "../store";
import { WindowControls } from "./WindowControls";
import { basename } from "../lib/utils";

export function Welcome() {
  const settings = useAppStore((s) => s.settings);
  const chooseVault = useAppStore((s) => s.chooseVault);
  const createVault = useAppStore((s) => s.createVault);
  const openVaultByPath = useAppStore((s) => s.openVaultByPath);
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
        <p className="welcome-tagline">Your notes, connected. Local-first Markdown knowledge base.</p>

        <div className="welcome-actions">
          <button className="welcome-button primary" onClick={() => void chooseVault()} disabled={initializing}>
            <FolderOpen size={18} />
            Open folder as vault
          </button>
          <button className="welcome-button" onClick={() => void createVault()} disabled={initializing}>
            <Plus size={18} />
            Create new vault
          </button>
        </div>

        {initializing && (
          <div className="welcome-loading">
            <Loader2 size={16} className="spin" />
            Opening vault…
          </div>
        )}

        {settings.recentVaults.length > 0 && (
          <div className="welcome-recents">
            <div className="welcome-recents-title">
              <Clock size={13} />
              Recent vaults
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
          Open source · Your notes stay on your device · Markdown files you own
        </p>
      </div>
    </div>
  );
}
