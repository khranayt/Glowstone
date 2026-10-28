import {
  FolderPlus,
  ListCollapse,
  ArrowUpDown,
  Search,
  SquarePen,
  Star,
  X,
  Files,
} from "lucide-react";
import { useAppStore } from "../store";
import { useT } from "../lib/useT";
import { FileExplorer } from "./FileExplorer";
import { SearchPanel } from "./SearchPanel";
import { BookmarksPanel } from "./BookmarksPanel";

export function Sidebar() {
  const t = useT();
  const view = useAppStore((s) => s.sidebarView);
  const vault = useAppStore((s) => s.vault);
  const createNote = useAppStore((s) => s.createNote);
  const createFolder = useAppStore((s) => s.createFolder);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleFolders = useAppStore((s) => s.toggleFolders);
  const fileSort = useAppStore((s) => s.fileSort);
  const setFileSort = useAppStore((s) => s.setFileSort);
  const title =
    view === "files"
      ? vault?.name ?? t("Files")
      : view === "bookmarks"
        ? t("Bookmarks")
        : t("Search");
  const ViewIcon = view === "files" ? Files : view === "bookmarks" ? Star : Search;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <ViewIcon size={15} />
          <span title={vault?.name}>{title}</span>
        </div>
        <div className="sidebar-actions">
          {view === "files" && (
            <>
              <button
                className="icon-button"
                onClick={() => void createNote()}
                title={t("New note")}
                aria-label={t("New note")}
              >
                <SquarePen size={15} />
              </button>
              <button
                className="icon-button"
                onClick={() => void createFolder()}
                title={t("New folder")}
                aria-label={t("New folder")}
              >
                <FolderPlus size={16} />
              </button>
              <button
                className="icon-button"
                onClick={() => setFileSort(fileSort === "name" ? "modified" : "name")}
                title={fileSort === "name" ? t("Sort by modified") : t("Sort by name")}
                aria-label={t("Sort files")}
              >
                <ArrowUpDown size={15} />
              </button>
              <button
                className="icon-button"
                onClick={toggleFolders}
                title={t("Expand all")}
                aria-label={t("Expand all")}
              >
                <ListCollapse size={16} />
              </button>
            </>
          )}
          <button
            className="icon-button"
            onClick={toggleSidebar}
            title={t("Close sidebar")}
            aria-label={t("Close sidebar")}
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="sidebar-content">
        {view === "files" && <FileExplorer />}
        {view === "search" && <SearchPanel />}
        {view === "bookmarks" && <BookmarksPanel />}
      </div>
    </aside>
  );
}
