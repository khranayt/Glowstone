import { useMemo, useState } from "react";
import { Maximize2, Waypoints } from "lucide-react";
import { useAppStore } from "../store";
import { GraphCanvas } from "./GraphCanvas";

export function GraphPanel() {
  const [depth, setDepth] = useState(2);
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

  // A local graph: the open note plus its neighbours, limited to `depth` hops.
  const localGraph = useMemo(() => {
    if (!graph) return null;
    if (!activeId || !graph.nodes.some((node) => node.id === activeId)) return graph;

    const adjacency = new Map<string, string[]>();
    for (const link of graph.links) {
      const from = adjacency.get(link.source);
      if (from) from.push(link.target);
      else adjacency.set(link.source, [link.target]);
      const to = adjacency.get(link.target);
      if (to) to.push(link.source);
      else adjacency.set(link.target, [link.source]);
    }

    const keep = new Set([activeId]);
    let frontier = [activeId];
    for (let hop = 0; hop < depth; hop += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighbour of adjacency.get(id) ?? []) {
          if (keep.has(neighbour)) continue;
          keep.add(neighbour);
          next.push(neighbour);
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }

    return {
      nodes: graph.nodes.filter((node) => keep.has(node.id)),
      links: graph.links.filter((link) => keep.has(link.source) && keep.has(link.target)),
    };
  }, [graph, activeId, depth]);

  const stats = useMemo(() => {
    if (!localGraph) return { notes: 0, links: 0 };
    return {
      notes: localGraph.nodes.filter((node) => !node.unresolved).length,
      links: localGraph.links.length,
    };
  }, [localGraph]);

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
        {activeId && (
          <div className="graph-panel-depth" role="group" aria-label="Local graph depth">
            {[1, 2, 3].map((value) => (
              <button
                key={value}
                className={depth === value ? "active" : ""}
                onClick={() => setDepth(value)}
                title={`${value} ${value === 1 ? "hop" : "hops"} from the open note`}
                aria-pressed={depth === value}
              >
                {value}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="graph-panel-canvas">
        {localGraph && localGraph.nodes.length > 0 ? (
          <GraphCanvas
            compact
            data={localGraph}
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
          Local graph · {depth} {depth === 1 ? "hop" : "hops"} from the open note.
        </div>
      )}
    </div>
  );
}
