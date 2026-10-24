import { useMemo } from "react";
import { Maximize2, Waypoints } from "lucide-react";
import { useAppStore } from "../store";
import { GraphCanvas } from "./GraphCanvas";

export function GraphPanel() {
  const graph = useAppStore((s) => s.graph);
  const loading = useAppStore((s) => s.graphLoading);
  const openGraphTab = useAppStore((s) => s.openGraphTab);
  const openNote = useAppStore((s) => s.openNote);
  const activePath = useAppStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.kind === "note" ? tab.path ?? null : null;
  });
  const activeId = useAppStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!tab?.path || !s.vault) return null;
    return tab.path.slice(s.vault.path.length + 1).replace(/\.(md|markdown)$/i, "");
  });

  const stats = useMemo(() => {
    if (!graph) return { notes: 0, links: 0 };
    return {
      notes: graph.nodes.filter((node) => !node.unresolved).length,
      links: graph.links.length,
    };
  }, [graph]);

  return (
    <div className="graph-panel">
      <div className="graph-panel-meta">
        <span>
          {stats.notes} {stats.notes === 1 ? "note" : "notes"}
        </span>
        <span className="muted">·</span>
        <span>
          {stats.links} {stats.links === 1 ? "link" : "links"}
        </span>
      </div>
      <div className="graph-panel-canvas">
        {graph && graph.nodes.length > 0 ? (
          <GraphCanvas
            compact
            data={graph}
            activeId={activeId}
            labels={false}
            repulsion={900}
            linkDistance={48}
            gravity={0.0024}
            onOpenNote={(path) => void openNote(path)}
          />
        ) : (
          <div className="graph-panel-empty">
            <Waypoints size={26} />
            <span>{loading ? "Building graph…" : "No notes yet"}</span>
          </div>
        )}
      </div>
      <div className="graph-panel-legend">
        <span className="legend-item">
          <span className="legend-dot resolved" /> Note
        </span>
        <span className="legend-item">
          <span className="legend-dot unresolved" /> Unresolved
        </span>
      </div>
      <button className="graph-panel-open" onClick={openGraphTab}>
        <Maximize2 size={14} />
        Open graph view
      </button>
      {activePath && (
        <div className="graph-panel-note" title={activePath}>
          Local graph is centred on the open note.
        </div>
      )}
    </div>
  );
}
