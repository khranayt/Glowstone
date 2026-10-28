import { Check, Loader2 } from "lucide-react";
import { useAppStore } from "../store";
import { wordCount } from "../lib/utils";
import { useT } from "../lib/useT";
import { plural } from "../lib/i18n";

export function StatusBar() {
  const t = useT();
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
  const noteCount = vault?.noteCount ?? 0;

  return (
    <footer className="status-bar">
      <div className="status-left">
        {vault && (
          <span className="status-item" title={vault.path}>
            {noteCount}{" "}
            {plural(noteCount, { en: ["note", "notes"], ru: ["заметка", "заметки", "заметок"] })} ·{" "}
            {links} {plural(links, { en: ["link", "links"], ru: ["связь", "связи", "связей"] })}
          </span>
        )}
        {noteTab && (
          <span className="status-item status-save">
            {savingCount > 0 ? (
              <>
                <Loader2 size={12} className="spin" /> {t("Saving…")}
              </>
            ) : dirty ? (
              settings.autoSave ? (
                <>{t("Unsaved changes")}</>
              ) : (
                <>{t("Unsaved")}</>
              )
            ) : (
              <>
                <Check size={12} /> {t("Saved")}
              </>
            )}
          </span>
        )}
      </div>
      <div className="status-right">
        {noteTab && (
          <>
            <span className="status-item">
              {words} {plural(words, { en: ["word", "words"], ru: ["слово", "слова", "слов"] })}
            </span>
            <span className="status-item">
              {characters}{" "}
              {plural(characters, {
                en: ["character", "characters"],
                ru: ["символ", "символа", "символов"],
              })}
            </span>
            <span className="status-item">
              {t("Ln {line}, Col {col}", { line: cursor.line, col: cursor.col })}
            </span>
          </>
        )}
        {!noteTab && tab?.kind === "graph" && (
          <span className="status-item">{t("Graph view")}</span>
        )}
      </div>
    </footer>
  );
}
