import {
  FolderPlus,
  ListCollapse,
  Maximize2,
  RefreshCw,
  Search,
  SquarePen,
  X,
  Waypoints,
  Files,
} from "lucide-react";
import { useAppStore } from "../store";
import { FileExplorer } from "./FileExplorer";
import { SearchPanel } from "./SearchPanel";
import { GraphPanel } from "./GraphPanel";

export function Sidebar() {
  const view = useAppStore((s) => s.sidebarView);
  const vault = useAppStore((s) => s.vault);
  const createNote = useAppStore((s) => s.createNote);
  const createFolder = useAppStore((s) => s.createFolder);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const openGraphTab = useAppStore((s) => s.openGraphTab);
  const refreshGraph = useAppStore((s) => s.refreshGraph);
  const title = view === "files" ? vault?.name ?? "Files" : view === "search" ? "Search" : "Graph";

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          {view === "files" ? <Files size={15} /> : view === "search" ? <Search size={15} /> : <Waypoints size={15} />}
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
                onClick={() => useAppStore.setState({ expanded: {} })}
                title="Collapse all folders"
                aria-label="Collapse all folders"
              >
                <ListCollapse size={16} />
              </button>
            </>
          )}
          {view === "graph" && (
            <>
              <button
                className="icon-button"
                onClick={() => void refreshGraph()}
                title="Refresh graph"
                aria-label="Refresh graph"
              >
                <RefreshCw size={15} />
              </button>
              <button
                className="icon-button"
                onClick={openGraphTab}
                title="Open graph in a tab"
                aria-label="Open graph in a tab"
              >
                <Maximize2 size={15} />
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
        {view === "graph" && <GraphPanel />}
      </div>
    </aside>
  );
}
