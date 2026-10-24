import { Download, FolderOpen, Loader2, Plus, Trash2, Waypoints } from "lucide-react";
import { Modal } from "./Modal";
import { useAppStore } from "../store";
import { basename } from "../lib/utils";

export function VaultManager() {
  const open = useAppStore((s) => s.vaultsOpen);
  const close = useAppStore((s) => s.closeVaults);
  const settings = useAppStore((s) => s.settings);
  const vault = useAppStore((s) => s.vault);
  const initializing = useAppStore((s) => s.initializing);
  const openVaultByPath = useAppStore((s) => s.openVaultByPath);
  const chooseVault = useAppStore((s) => s.chooseVault);
  const createVault = useAppStore((s) => s.createVault);
  const openImport = useAppStore((s) => s.openImport);
  const removeRecentVault = useAppStore((s) => s.removeRecentVault);

  const recents = settings.recentVaults;

  return (
    <Modal open={open} onClose={close} title="Vaults" width={600} className="vault-manager">
      <div className="vault-manager-body">
        <div className="vault-manager-current">
          <span className="vault-manager-current-icon">
            <Waypoints size={19} />
          </span>
          <div className="vault-manager-current-copy">
            <div className="vault-manager-current-label">Current vault</div>
            <div className="vault-manager-current-name">{vault?.name ?? "No vault open"}</div>
            {vault && <div className="vault-manager-current-path">{vault.path}</div>}
          </div>
          {vault && (
            <span className="vault-manager-count">
              {vault.noteCount} {vault.noteCount === 1 ? "note" : "notes"}
            </span>
          )}
        </div>

        <div className="vault-manager-actions">
          <button className="btn btn-secondary" onClick={() => void chooseVault()} disabled={initializing}>
            <FolderOpen size={15} />
            Open folder…
          </button>
          <button className="btn btn-secondary" onClick={() => void createVault()} disabled={initializing}>
            <Plus size={15} />
            New vault…
          </button>
          <button className="btn btn-secondary" onClick={openImport} disabled={initializing}>
            <Download size={15} />
            Import notes…
          </button>
        </div>

        <div className="vault-manager-section-title">
          <span>Recent vaults</span>
          {recents.length > 0 && <span className="vault-manager-hint">Double-click to open</span>}
        </div>

        {recents.length === 0 ? (
          <div className="vault-manager-empty">
            <FolderOpen size={26} />
            <p>No vaults yet. Open a folder or create a new vault to get started.</p>
          </div>
        ) : (
          <div className="vault-manager-list">
            {recents.map((path) => {
              const current = vault?.path === path;
              return (
                <div
                  key={path}
                  className={`vault-manager-item ${current ? "current" : ""}`}
                  onDoubleClick={() => {
                    if (initializing) return;
                    void openVaultByPath(path);
                    close();
                  }}
                  title={path}
                >
                  <span className="vault-manager-item-icon">
                    <FolderOpen size={16} />
                  </span>
                  <div className="vault-manager-item-copy">
                    <div className="vault-manager-item-name">
                      {basename(path)}
                      {current && <span className="vault-manager-badge">Open</span>}
                    </div>
                    <div className="vault-manager-item-path">{path}</div>
                  </div>
                  <button
                    className="icon-button vault-manager-open"
                    onClick={() => {
                      if (initializing) return;
                      void openVaultByPath(path);
                      close();
                    }}
                    title="Open vault"
                    aria-label="Open vault"
                    disabled={initializing}
                  >
                    {initializing ? <Loader2 size={15} className="spin" /> : <FolderOpen size={15} />}
                  </button>
                  <button
                    className="icon-button vault-manager-remove"
                    onClick={() => removeRecentVault(path)}
                    title="Remove from recent vaults"
                    aria-label="Remove from recent vaults"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="vault-manager-note">
          Removing a vault from this list never deletes files from your disk.
        </p>
      </div>
    </Modal>
  );
}
