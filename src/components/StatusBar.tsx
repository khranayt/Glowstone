import { Check, Loader2 } from "lucide-react";
import { useAppStore } from "../store";
import { wordCount } from "../lib/utils";

export function StatusBar() {
  const vault = useAppStore((s) => s.vault);
  const graph = useAppStore((s) => s.graph);
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  const cursor = useAppStore((s) => s.cursor);
  const savingCount = useAppStore((s) => s.savingCount);
  const settings = useAppStore((s) => s.settings);

  const noteTab = tab?.kind === "note" ? tab : null;
  const words = noteTab ? wordCount(noteTab.content) : 0;
  const characters = noteTab ? noteTab.content.length : 0;
  const dirty = noteTab ? noteTab.content !== noteTab.savedContent : false;
  const links = graph?.links.length ?? 0;

  return (
    <footer className="status-bar">
      <div className="status-left">
        {vault && (
          <span className="status-item" title={vault.path}>
            {vault.noteCount} {vault.noteCount === 1 ? "note" : "notes"} · {links}{" "}
            {links === 1 ? "link" : "links"}
          </span>
        )}
        {noteTab && (
          <span className="status-item status-save">
            {savingCount > 0 ? (
              <>
                <Loader2 size={12} className="spin" /> Saving…
              </>
            ) : dirty ? (
              settings.autoSave ? (
                <>Unsaved changes</>
              ) : (
                <>Unsaved</>
              )
            ) : (
              <>
                <Check size={12} /> Saved
              </>
            )}
          </span>
        )}
      </div>
      <div className="status-right">
        {noteTab && (
          <>
            <span className="status-item">
              {words} {words === 1 ? "word" : "words"}
            </span>
            <span className="status-item">
              {characters} {characters === 1 ? "character" : "characters"}
            </span>
            <span className="status-item">
              Ln {cursor.line}, Col {cursor.col}
            </span>
          </>
        )}
        {!noteTab && tab?.kind === "graph" && (
          <span className="status-item">Graph view</span>
        )}
      </div>
    </footer>
  );
}
