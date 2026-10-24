import { useMemo } from "react";
import { ArrowUpRight, Link2, ListTree, X } from "lucide-react";
import { useAppStore } from "../store";
import { backlinksFor, extractHeadings, noteIdFromPath } from "../lib/utils";

export function RightSidebar() {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  const panel = useAppStore((s) => s.rightPanel);
  const setPanel = useAppStore((s) => s.setRightPanel);
  const setOpen = useAppStore((s) => s.setRightPanelOpen);
  const graph = useAppStore((s) => s.graph);
  const vault = useAppStore((s) => s.vault);
  const openNote = useAppStore((s) => s.openNote);
  const requestJump = useAppStore((s) => s.requestJump);

  const noteTab = tab?.kind === "note" ? tab : null;
  const headings = useMemo(
    () => (noteTab ? extractHeadings(noteTab.content) : []),
    [noteTab?.content, noteTab?.id],
  );
  const noteId = useMemo(
    () => (vault && noteTab?.path ? noteIdFromPath(vault.path, noteTab.path) : null),
    [vault?.path, noteTab?.path],
  );
  const backlinks = useMemo(
    () => (noteId ? backlinksFor(graph, noteId) : []),
    [graph, noteId],
  );

  return (
    <aside className="right-sidebar">
      <div className="right-sidebar-header">
        <div className="right-sidebar-tabs">
          <button
            className={`right-sidebar-tab ${panel === "outline" ? "active" : ""}`}
            onClick={() => setPanel("outline")}
          >
            <ListTree size={14} />
            Outline
          </button>
          <button
            className={`right-sidebar-tab ${panel === "backlinks" ? "active" : ""}`}
            onClick={() => setPanel("backlinks")}
          >
            <Link2 size={14} />
            Backlinks
            {backlinks.length > 0 && <span className="tab-count">{backlinks.length}</span>}
          </button>
        </div>
        <button
          className="icon-button"
          onClick={() => setOpen(false)}
          title="Close panel"
          aria-label="Close panel"
        >
          <X size={15} />
        </button>
      </div>

      <div className="right-sidebar-body">
        {!noteTab && (
          <div className="sidebar-placeholder">
            <p>No note is open.</p>
            <p className="hint">Open a note to see its outline and backlinks.</p>
          </div>
        )}

        {noteTab && panel === "outline" && (
          <>
            {headings.length === 0 ? (
              <div className="sidebar-placeholder">
                <p>No headings yet.</p>
                <p className="hint">Use # headings to build an outline.</p>
              </div>
            ) : (
              <div className="outline-list">
                {headings.map((heading, index) => (
                  <button
                    key={`${heading.line}-${index}`}
                    className={`outline-item outline-level-${heading.level}`}
                    onClick={() => {
                      if (!vault) return;
                      requestJump(noteTab.id, heading.line);
                    }}
                    title={`Line ${heading.line}`}
                  >
                    {heading.text}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {noteTab && panel === "backlinks" && (
          <>
            <div className="right-sidebar-section-title">
              Linked mentions <span>{backlinks.length}</span>
            </div>
            {backlinks.length === 0 ? (
              <div className="sidebar-placeholder">
                <p>No backlinks found.</p>
                <p className="hint">
                  Link to this note with <code>[[{noteTab.title}]]</code> from another note.
                </p>
              </div>
            ) : (
              <div className="backlink-list">
                {backlinks.map((link) => (
                  <button
                    key={link.id}
                    className="backlink-item"
                    onClick={() => link.path && void openNote(link.path)}
                    title={link.folder ? `${link.folder}/${link.title}` : link.title}
                  >
                    <span className="backlink-icon">
                      <ArrowUpRight size={14} />
                    </span>
                    <span className="backlink-text">
                      <span className="backlink-title">{link.title}</span>
                      {link.folder && <span className="backlink-folder">{link.folder}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
