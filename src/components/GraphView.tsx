import { useMemo, useRef, useState } from "react";
import {
  Circle,
  CircleDot,
  Maximize2,
  RefreshCw,
  Search,
  Settings2,
  Tag,
  Waypoints,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import { useAppStore } from "../store";
import { GraphCanvas, type GraphCanvasHandle } from "./GraphCanvas";
import { Popover } from "./Popover";
import { noteIdFromPath } from "../lib/utils";

export function GraphView() {
  const graph = useAppStore((s) => s.graph);
  const loading = useAppStore((s) => s.graphLoading);
  const refreshGraph = useAppStore((s) => s.refreshGraph);
  const openNote = useAppStore((s) => s.openNote);
  const createNote = useAppStore((s) => s.createNote);
  const vault = useAppStore((s) => s.vault);
  const focusPath = useAppStore((s) => s.graphFocusPath);
  const scope = useAppStore((s) => s.graphScope);
  const depth = useAppStore((s) => s.graphDepth);
  const setScope = useAppStore((s) => s.setGraphScope);
  const setDepth = useAppStore((s) => s.setGraphDepth);
  const activeNotePath = useAppStore((s) => {
    const tab = s.tabs.find((item) => item.id === s.activeTabId);
    return tab?.kind === "note" ? tab.path ?? null : null;
  });
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState(true);
  const [showOrphans, setShowOrphans] = useState(true);
  const [showUnresolved, setShowUnresolved] = useState(true);
  const [repulsion, setRepulsion] = useState(1800);
  const [linkDistance, setLinkDistance] = useState(70);
  const [gravity, setGravity] = useState(0.003);
  const canvasRef = useRef<GraphCanvasHandle>(null);

  const focus = focusPath ?? activeNotePath;
  const activeId = vault && focus ? noteIdFromPath(vault.path, focus) : null;
  const hasActive = Boolean(activeId && graph?.nodes.some((node) => node.id === activeId));

  // Local scope keeps the focused note plus everything within a few hops.
  const data = useMemo(() => {
    if (!graph) return { nodes: [], links: [] };
    if (scope !== "local" || !activeId || !hasActive) return graph;

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
  }, [graph, scope, activeId, hasActive, depth]);

  const stats = useMemo(() => {
    if (!graph) return { notes: 0, links: 0 };
    return {
      notes: data.nodes.filter((node) => !node.unresolved).length,
      links: data.links.length,
    };
  }, [graph, data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.nodes
      .filter((node) => showOrphans || node.degree > 0)
      .filter((node) => showUnresolved || !node.unresolved)
      .filter((node) => !q || node.title.toLowerCase().includes(q) || node.folder.toLowerCase().includes(q));
  }, [data.nodes, query, showOrphans, showUnresolved]);

  const resetForces = () => {
    setRepulsion(1800);
    setLinkDistance(70);
    setGravity(0.003);
  };

  return (
    <div className="graph-view">
      <div className="note-header graph-header">
        <div className="note-header-left">
          <span className="graph-header-icon">
            <Waypoints size={16} />
          </span>
          <span className="note-header-title">Graph</span>
          <div className="graph-scope" role="group" aria-label="Graph scope">
            <button
              className={scope === "global" ? "active" : ""}
              onClick={() => setScope("global")}
              title="Show the whole vault"
              aria-pressed={scope === "global"}
            >
              Global
            </button>
            <button
              className={scope === "local" ? "active" : ""}
              onClick={() => setScope("local")}
              disabled={!hasActive}
              title={
                hasActive
                  ? "Show only the open note and its neighbours"
                  : "Open a note first to use the local graph"
              }
              aria-pressed={scope === "local"}
            >
              Local
            </button>
          </div>
          {scope === "local" && hasActive && (
            <div className="graph-depth" role="group" aria-label="Local graph depth">
              {[1, 2, 3, 4].map((value) => (
                <button
                  key={value}
                  className={depth === value ? "active" : ""}
                  onClick={() => setDepth(value)}
                  title={`${value} ${value === 1 ? "hop" : "hops"} from the focused note`}
                  aria-pressed={depth === value}
                >
                  {value}
                </button>
              ))}
            </div>
          )}
          <span className="graph-header-stats">
            {stats.notes} {stats.notes === 1 ? "note" : "notes"} · {stats.links}{" "}
            {stats.links === 1 ? "link" : "links"}
          </span>
        </div>
        <div className="note-header-actions">
          <button
            className="icon-button"
            onClick={() => canvasRef.current?.zoomOut()}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => canvasRef.current?.zoomIn()}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => canvasRef.current?.fit()}
            title="Fit to view"
            aria-label="Fit to view"
          >
            <Maximize2 size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => void refreshGraph()}
            title="Refresh graph"
            aria-label="Refresh graph"
          >
            <RefreshCw size={16} />
          </button>
          <Popover
            align="right"
            width={260}
            trigger={({ toggle, open }) => (
              <button
                className={`icon-button ${open ? "active" : ""}`}
                onClick={toggle}
                title="Graph settings"
                aria-label="Graph settings"
              >
                <Settings2 size={16} />
              </button>
            )}
          >
            {() => (
              <div className="graph-settings">
                <div className="graph-settings-title">Forces</div>
                <label className="range-row">
                  <span>Repulsion</span>
                  <input
                    type="range"
                    min={600}
                    max={5000}
                    step={100}
                    value={repulsion}
                    onChange={(event) => setRepulsion(Number(event.target.value))}
                  />
                </label>
                <label className="range-row">
                  <span>Link distance</span>
                  <input
                    type="range"
                    min={30}
                    max={180}
                    step={5}
                    value={linkDistance}
                    onChange={(event) => setLinkDistance(Number(event.target.value))}
                  />
                </label>
                <label className="range-row">
                  <span>Gravity</span>
                  <input
                    type="range"
                    min={0}
                    max={0.004}
                    step={0.0001}
                    value={gravity}
                    onChange={(event) => setGravity(Number(event.target.value))}
                  />
                </label>
                <div className="graph-settings-divider" />
                <button className="menu-item" onClick={resetForces}>
                  <RotateCcw size={14} />
                  <span>Reset forces</span>
                </button>
                <div className="graph-settings-hint">Drag to rearrange · scroll to zoom · double-click to open a note</div>
              </div>
            )}
          </Popover>
        </div>
      </div>

      <div className="graph-stage">
        <div className="graph-floating-toolbar">
          <div className="graph-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter notes…"
              spellCheck={false}
            />
          </div>
          <div className="graph-toggles">
            <button
              className={`icon-button ${labels ? "active" : ""}`}
              onClick={() => setLabels((value) => !value)}
              title="Show labels"
              aria-label="Show labels"
            >
              <Tag size={15} />
            </button>
            <button
              className={`icon-button ${showOrphans ? "active" : ""}`}
              onClick={() => setShowOrphans((value) => !value)}
              title="Show orphan notes"
              aria-label="Show orphan notes"
            >
              <CircleDot size={15} />
            </button>
            <button
              className={`icon-button ${showUnresolved ? "active" : ""}`}
              onClick={() => setShowUnresolved((value) => !value)}
              title="Show unresolved links"
              aria-label="Show unresolved links"
            >
              <Circle size={15} />
            </button>
          </div>
        </div>

        {data.nodes.length === 0 && !loading ? (
          <div className="graph-empty">
            <Waypoints size={38} />
            <h2>No notes to graph yet</h2>
            <p>Create a note and link it with <code>[[wikilinks]]</code> to see the graph grow.</p>
            <button className="btn btn-primary" onClick={() => void createNote()}>
              Create a note
            </button>
          </div>
        ) : (
          <GraphCanvas
            ref={canvasRef}
            data={data}
            activeId={activeId}
            labels={labels}
            showOrphans={showOrphans}
            showUnresolved={showUnresolved}
            repulsion={repulsion}
            linkDistance={linkDistance}
            gravity={gravity}
            filter={query}
            onOpenNote={(path) => void openNote(path, { newTab: false })}
          />
        )}

        <div className="graph-legend">
          <span className="legend-item">
            <span className="legend-dot resolved" /> Note
          </span>
          <span className="legend-item">
            <span className="legend-dot unresolved" /> Unresolved
          </span>
        </div>
        {loading && <div className="graph-loading">Building graph…</div>}
        {filtered.length !== data.nodes.length && (
          <div className="graph-filter-count">{filtered.length} shown</div>
        )}
      </div>
    </div>
  );
}
