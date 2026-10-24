import {
  FolderPlus,
  ListCollapse,
  Search,
  SquarePen,
  X,
  Files,
} from "lucide-react";
import { useAppStore } from "../store";
import { FileExplorer } from "./FileExplorer";
import { SearchPanel } from "./SearchPanel";

export function Sidebar() {
  const view = useAppStore((s) => s.sidebarView);
  const vault = useAppStore((s) => s.vault);
  const createNote = useAppStore((s) => s.createNote);
  const createFolder = useAppStore((s) => s.createFolder);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleFolders = useAppStore((s) => s.toggleFolders);
  const title = view === "files" ? vault?.name ?? "Files" : "Search";

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          {view === "files" ? <Files size={15} /> : <Search size={15} />}
          <span title={vault?.name}>{title}</span>
        </div>
        <div className="sidebar-actions">
          {view === "files" && (
            <>
              <button
                className="icon-button"
                onClick={() => void createNote()}
                title="New note"
                aria-label="New note"
              >
                <SquarePen size={15} />
              </button>
              <button
                className="icon-button"
                onClick={() => void createFolder()}
                title="New folder"
                aria-label="New folder"
              >
                <FolderPlus size={16} />
              </button>
              <button
                className="icon-button"
                onClick={toggleFolders}
                title="Collapse or expand all folders"
                aria-label="Collapse or expand all folders"
              >
                <ListCollapse size={16} />
              </button>
            </>
          )}
          <button
            className="icon-button"
            onClick={toggleSidebar}
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="sidebar-content">
        {view === "files" && <FileExplorer />}
        {view === "search" && <SearchPanel />}
      </div>
    </aside>
  );
}
