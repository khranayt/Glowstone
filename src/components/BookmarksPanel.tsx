import { FolderClosed, Star, X } from "lucide-react";
import { useAppStore } from "../store";
import { useT } from "../lib/useT";

export function BookmarksPanel() {
  const t = useT();
  const bookmarks = useAppStore((s) => s.bookmarks);
  const openNote = useAppStore((s) => s.openNote);
  const toggleBookmark = useAppStore((s) => s.toggleBookmark);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const setExpanded = useAppStore((s) => s.setExpanded);

  if (bookmarks.length === 0) {
    return (
      <div className="bookmarks-empty">
        <Star size={26} />
        <p>{t("No bookmarks yet")}</p>
        <span>{t("Bookmark a note or folder from its context menu.")}</span>
      </div>
    );
  }

  return (
    <div className="bookmarks-panel">
      {bookmarks.map((bookmark) => (
        <div className="bookmark-row" key={bookmark.path}>
          <button
            className="bookmark-open"
            onClick={() => {
              if (bookmark.isDir) {
                setSidebarView("files");
                setExpanded(bookmark.path, true);
              } else {
                void openNote(bookmark.path);
              }
            }}
            title={bookmark.path}
          >
            {bookmark.isDir ? <FolderClosed size={15} /> : <Star size={14} />}
            <span>{bookmark.title}</span>
          </button>
          <button
            className="icon-button bookmark-remove"
            onClick={() => toggleBookmark(bookmark)}
            title={t("Remove bookmark")}
            aria-label={t("Remove bookmark")}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
