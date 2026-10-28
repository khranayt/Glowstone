import { Search, SquarePen, Table2, Frame } from "lucide-react";
import { useAppStore } from "../store";
import { useT } from "../lib/useT";

export function EmptyState() {
  const t = useT();
  const createNote = useAppStore((s) => s.createNote);
  const createBase = useAppStore((s) => s.createBase);
  const createCanvas = useAppStore((s) => s.createCanvas);
  const openSwitcher = useAppStore((s) => s.openSwitcher);

  return (
    <div className="empty-state">
      <div className="empty-actions">
        <button className="empty-action" onClick={() => void createNote()}>
          <SquarePen size={15} />
          <span>{t("New note")}</span>
          <kbd>Ctrl + N</kbd>
        </button>
        <button className="empty-action" onClick={() => void createBase()}>
          <Table2 size={15} />
          <span>{t("Create database")}</span>
        </button>
        <button className="empty-action" onClick={() => void createCanvas()}>
          <Frame size={15} />
          <span>{t("New canvas")}</span>
        </button>
        <button className="empty-action" onClick={openSwitcher}>
          <Search size={15} />
          <span>{t("Go to file")}</span>
          <kbd>Ctrl + O</kbd>
        </button>
      </div>
    </div>
  );
}
