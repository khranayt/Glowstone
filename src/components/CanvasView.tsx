import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Maximize2,
  Plus,
  StickyNote,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../store";
import { useT } from "../lib/useT";
import { plural } from "../lib/i18n";
import type { Tab } from "../types";
import { renderMarkdown } from "../lib/markdown";
import { findNoteByLink, joinPath, titleFromPath } from "../lib/utils";

interface CanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  color?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  label?: string;
  color?: string;
}

interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

const EMPTY: CanvasData = { nodes: [], edges: [] };

const parseCanvas = (content: string): CanvasData => {
  try {
    const parsed = JSON.parse(content) as Partial<CanvasData>;
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
  } catch {
    return { ...EMPTY };
  }
};

const serialize = (data: CanvasData) => `${JSON.stringify(data, null, 2)}\n`;

const COLORS: Record<string, string> = {
  "1": "#e06c75",
  "2": "#d19a66",
  "3": "#e5c07b",
  "4": "#98c379",
  "5": "#56b6c2",
  "6": "#c678dd",
};

const colorOf = (color?: string) => (color ? COLORS[color] : undefined);

export function CanvasView({ tab }: { tab: Tab }) {
  const t = useT();
  const vault = useAppStore((s) => s.vault);
  const tree = useAppStore((s) => s.tree);
  const setTabContent = useAppStore((s) => s.setTabContent);
  const openNote = useAppStore((s) => s.openNote);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const [data, setData] = useState<CanvasData>(() => parseCanvas(tab.content));
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const lastContent = useRef(tab.content);
  const dataRef = useRef(data);
  dataRef.current = data;
  const viewport = useRef<HTMLDivElement | null>(null);
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const dragging = useRef<{
    id: string;
    x: number;
    y: number;
    nx: number;
    ny: number;
  } | null>(null);

  useEffect(() => {
    setData(parseCanvas(tab.content));
    lastContent.current = tab.content;
    setSelected(null);
    setEditing(null);
  }, [tab.id]);

  useEffect(() => {
    if (tab.content === lastContent.current) return;
    setData(parseCanvas(tab.content));
    lastContent.current = tab.content;
  }, [tab.content]);

  const commit = (next: CanvasData) => {
    setData(next);
    const text = serialize(next);
    lastContent.current = text;
    setTabContent(tab.id, text);
  };

  const fit = () => {
    if (data.nodes.length === 0) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of data.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    const rect = viewport.current?.getBoundingClientRect();
    const width = rect?.width ?? 900;
    const height = rect?.height ?? 600;
    const scale = Math.max(
      0.2,
      Math.min(1.4, (width - 120) / Math.max(1, maxX - minX), (height - 120) / Math.max(1, maxY - minY)),
    );
    setView({
      scale,
      x: width / 2 - ((minX + maxX) / 2) * scale,
      y: height / 2 - ((minY + maxY) / 2) * scale,
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(fit, 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  const zoom = (factor: number, cx?: number, cy?: number) => {
    setView((current) => {
      const rect = viewport.current?.getBoundingClientRect();
      const px = cx ?? (rect ? rect.width / 2 : 0);
      const py = cy ?? (rect ? rect.height / 2 : 0);
      const scale = Math.max(0.2, Math.min(2.5, current.scale * factor));
      return {
        scale,
        x: px - ((px - current.x) / current.scale) * scale,
        y: py - ((py - current.y) / current.scale) * scale,
      };
    });
  };

  const nodeById = useMemo(
    () => new Map(data.nodes.map((node) => [node.id, node])),
    [data.nodes],
  );

  const addText = () => {
    const rect = viewport.current?.getBoundingClientRect();
    const x = ((rect?.width ?? 900) / 2 - view.x) / view.scale - 150;
    const y = ((rect?.height ?? 600) / 2 - view.y) / view.scale - 80;
    const node: CanvasNode = {
      id: crypto.randomUUID?.() ?? `node-${Date.now()}`,
      type: "text",
      text: t("Double-click to edit"),
      x,
      y,
      width: 300,
      height: 160,
    };
    commit({ ...data, nodes: [...data.nodes, node] });
    setSelected(node.id);
    setEditing(node.id);
  };

  const addNote = () => {
    setPrompt({
      title: t("Add note card"),
      label: t("Note"),
      placeholder: t("Note"),
      onSubmit: (value) => {
        const note = findNoteByLink(tree, value, tab.path);
        if (!note) return;
        const rect = viewport.current?.getBoundingClientRect();
        const x = ((rect?.width ?? 900) / 2 - view.x) / view.scale - 150;
        const y = ((rect?.height ?? 600) / 2 - view.y) / view.scale - 90;
        const node: CanvasNode = {
          id: crypto.randomUUID?.() ?? `node-${Date.now()}`,
          type: "file",
          file: note.path,
          x,
          y,
          width: 300,
          height: 180,
        };
        commit({ ...data, nodes: [...data.nodes, node] });
        setSelected(node.id);
      },
    });
  };

  const removeNode = (id: string) => {
    commit({
      nodes: data.nodes.filter((node) => node.id !== id),
      edges: data.edges.filter((edge) => edge.fromNode !== id && edge.toNode !== id),
    });
    if (selected === id) setSelected(null);
    if (editing === id) setEditing(null);
  };

  const updateNode = (id: string, patch: Partial<CanvasNode>) =>
    commit({
      ...data,
      nodes: data.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    });

  const openNode = (node: CanvasNode) => {
    if (node.type === "file" && node.file && vault) {
      const path = node.file.startsWith(vault.path)
        ? node.file
        : joinPath(vault.path, node.file);
      void openNote(path);
    } else if (node.type === "link" && node.url) {
      void openUrl(node.url).catch(() => undefined);
    }
  };

  const startDrag = (event: React.PointerEvent, node: CanvasNode) => {
    if (editing === node.id) return;
    if ((event.target as HTMLElement).closest("button, textarea, a")) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging.current = {
      id: node.id,
      x: event.clientX,
      y: event.clientY,
      nx: node.x,
      ny: node.y,
    };
    setSelected(node.id);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (panning.current) {
      setView((current) => ({
        ...current,
        x: panning.current!.ox + event.clientX - panning.current!.x,
        y: panning.current!.oy + event.clientY - panning.current!.y,
      }));
      return;
    }
    const drag = dragging.current;
    if (!drag) return;
    setData((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === drag.id
          ? {
              ...node,
              x: drag.nx + (event.clientX - drag.x) / view.scale,
              y: drag.ny + (event.clientY - drag.y) / view.scale,
            }
          : node,
      ),
    }));
  };

  const onPointerUp = () => {
    panning.current = null;
    if (dragging.current) {
      dragging.current = null;
      const text = serialize(dataRef.current);
      lastContent.current = text;
      setTabContent(tab.id, text);
    }
  };

  return (
    <div className="note-view special-view canvas-view">
      <header className="note-header special-header">
        <div className="note-header-left">
          <span className="graph-header-icon">
            <StickyNote size={16} />
          </span>
          <span className="note-header-title">{tab.title}</span>
          <span className="special-meta">
            {data.nodes.length} {plural(data.nodes.length, { en: ["node", "nodes"], ru: ["узел", "узла", "узлов"] })} · {data.edges.length} {plural(data.edges.length, { en: ["link", "links"], ru: ["связь", "связи", "связей"] })}
          </span>
        </div>
        <div className="note-header-actions">
          <button className="icon-button" onClick={addText} title={t("Add card")} aria-label={t("Add card")}>
            <Plus size={16} />
          </button>
          <button className="icon-button" onClick={addNote} title={t("Add note card")} aria-label={t("Add note card")}>
            <FileText size={16} />
          </button>
          <button className="icon-button" onClick={() => zoom(1.2)} title={t("Zoom in")} aria-label={t("Zoom in")}>
            <ZoomIn size={16} />
          </button>
          <button className="icon-button" onClick={() => zoom(1 / 1.2)} title={t("Zoom out")} aria-label={t("Zoom out")}>
            <ZoomOut size={16} />
          </button>
          <button className="icon-button" onClick={fit} title={t("Fit")} aria-label={t("Fit")}>
            <Maximize2 size={16} />
          </button>
          {selected && (
            <button
              className="icon-button danger"
              onClick={() => removeNode(selected)}
              title={t("Delete card")}
              aria-label={t("Delete card")}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>

      <div
        className="canvas-viewport"
        ref={viewport}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          zoom(
            Math.exp(-event.deltaY * 0.0015),
            event.clientX - rect.left,
            event.clientY - rect.top,
          );
        }}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          panning.current = {
            x: event.clientX,
            y: event.clientY,
            ox: view.x,
            oy: view.y,
          };
          setSelected(null);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="canvas-stage"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <svg className="canvas-edges">
            {data.edges.map((edge) => {
              const from = nodeById.get(edge.fromNode);
              const to = nodeById.get(edge.toNode);
              if (!from || !to) return null;
              const x1 = from.x + from.width / 2;
              const y1 = from.y + from.height / 2;
              const x2 = to.x + to.width / 2;
              const y2 = to.y + to.height / 2;
              return (
                <g key={edge.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={colorOf(edge.color) ?? "var(--text-faint)"}
                    strokeWidth={2}
                    markerEnd="url(#canvas-arrow)"
                  />
                  {edge.label && (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle">
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
            <defs>
              <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-faint)" />
              </marker>
            </defs>
          </svg>

          {data.nodes.map((node) => {
            const color = colorOf(node.color);
            const isEditing = editing === node.id;
            const content =
              node.type === "text"
                ? node.text ?? ""
                : node.type === "file"
                  ? titleFromPath(node.file ?? "")
                  : node.type === "link"
                    ? node.url ?? ""
                    : node.label ?? "";
            return (
              <div
                key={node.id}
                className={`canvas-card canvas-${node.type} ${selected === node.id ? "selected" : ""}`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  ...(color ? { borderColor: color, background: `color-mix(in srgb, ${color} 16%, var(--background-primary))` } : {}),
                }}
                onPointerDown={(event) => startDrag(event, node)}
                onDoubleClick={() => {
                  if (node.type === "text") {
                    setEditing(node.id);
                    setSelected(node.id);
                  } else {
                    openNode(node);
                  }
                }}
              >
                {node.type === "group" ? (
                  <div className="canvas-group-label">{node.label || t("Group")}</div>
                ) : isEditing ? (
                  <textarea
                    className="canvas-text-editor"
                    autoFocus
                    value={node.text ?? ""}
                    onChange={(event) => updateNode(node.id, { text: event.target.value })}
                    onBlur={() => setEditing(null)}
                    onPointerDown={(event) => event.stopPropagation()}
                  />
                ) : (
                  <div
                    className="canvas-card-content"
                    dangerouslySetInnerHTML={{
                      __html:
                        node.type === "text"
                          ? renderMarkdown(node.text ?? "")
                          : renderMarkdown(
                              node.type === "file"
                                ? `[[${content}]]`
                                : node.type === "link"
                                  ? `[${node.url}](${node.url})`
                                  : content,
                            ),
                    }}
                  />
                )}
                {node.type === "group" && <div className="canvas-group-body" />}
                {selected === node.id && (
                  <button
                    className="canvas-card-delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeNode(node.id);
                    }}
                    title={t("Delete card")}
                    aria-label={t("Delete card")}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {data.nodes.length === 0 && <div className="canvas-empty">{t("Add card")}</div>}
      </div>
    </div>
  );
}
