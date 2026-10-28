import { Search, SquarePen } from "lucide-react";
import { useAppStore } from "../store";

export function EmptyState() {
  const createNote = useAppStore((s) => s.createNote);
  const openSwitcher = useAppStore((s) => s.openSwitcher);

  return (
    <div className="empty-state">
      <div className="empty-actions">
        <button className="empty-action" onClick={() => void createNote()}>
          <SquarePen size={15} />
          <span>New note</span>
          <kbd>Ctrl + N</kbd>
        </button>
        <button className="empty-action" onClick={openSwitcher}>
          <Search size={15} />
          <span>Go to file</span>
          <kbd>Ctrl + O</kbd>
        </button>
      </div>
    </div>
  );
}
