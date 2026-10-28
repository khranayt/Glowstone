import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { GraphData, GraphGroup, GraphNode } from "../types";
import { useAppStore } from "../store";
import { groupForNode } from "../lib/graphGroups";
import { useT } from "../lib/useT";
import { plural } from "../lib/i18n";

export interface GraphCanvasHandle {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface GraphCanvasProps {
  data: GraphData;
  activeId?: string | null;
  compact?: boolean;
  labels?: boolean;
  showUnresolved?: boolean;
  showOrphans?: boolean;
  repulsion?: number;
  linkDistance?: number;
  gravity?: number;
  filter?: string;
  groups?: GraphGroup[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  onOpenNote: (path: string) => void;
}

interface SimNode {
  id: string;
  title: string;
  path: string;
  folder: string;
  degree: number;
  unresolved: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  index: number;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
}

interface TooltipState {
  id: string;
  x: number;
  y: number;
  title: string;
  folder: string;
  degree: number;
  unresolved: boolean;
}

interface Palette {
  node: string;
  unresolved: string;
  unresolvedHover: string;
  nodeHover: string;
  active: string;
  edge: string;
  edgeActive: string;
  label: string;
  labelHalo: string;
}

const positionsCache = new Map<string, { x: number; y: number }>();

const paletteFor = (dark: boolean): Palette =>
  dark
    ? {
        node: "#d9b45a",
        unresolved: "#9a9a94",
        unresolvedHover: "#d2d2c8",
        nodeHover: "#f4d47c",
        active: "#ffe09a",
        edge: "rgba(198,198,198,0.55)",
        edgeActive: "rgba(244,212,124,0.95)",
        label: "#b8b8b8",
        labelHalo: "rgba(24,24,24,0.9)",
      }
    : {
        node: "#b4861f",
        unresolved: "#7c7870",
        unresolvedHover: "#3f3b34",
        nodeHover: "#8d6a13",
        active: "#7a5b0d",
        edge: "rgba(70,70,70,0.45)",
        edgeActive: "rgba(146,110,26,0.8)",
        label: "#575757",
        labelHalo: "rgba(255,255,255,0.92)",
      };

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  {
    data,
    activeId,
    compact = false,
    labels = false,
    showUnresolved = false,
    showOrphans = true,
    repulsion = 1800,
    linkDistance = 70,
    gravity = 0.003,
    filter = "",
    groups = [],
    selectedIds,
    onSelectionChange,
    onOpenNote,
  },
  ref,
) {
  const t = useT();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = useAppStore((s) => s.settings.theme);
  const paletteRef = useRef<Palette>(paletteFor(theme === "dark"));
  paletteRef.current = paletteFor(theme === "dark");

  const simRef = useRef({
    nodes: [] as SimNode[],
    links: [] as SimLink[],
    byId: new Map<string, SimNode>(),
    alpha: 1,
    tx: 0,
    ty: 0,
    k: 1,
    width: 0,
    height: 0,
    dpr: 1,
    hoveredId: null as string | null,
    selectedId: null as string | null,
    selectedIds: new Set<string>(),
    dragging: null as SimNode | null,
    dragMoved: false,
    panning: false,
    lastPointer: { x: 0, y: 0 },
    needsDraw: true,
    autoFit: 40,
  });

  const optionsRef = useRef({ repulsion, linkDistance, gravity, labels, compact, getFiltered: filter });
  optionsRef.current = { repulsion, linkDistance, gravity, labels, compact, getFiltered: filter };
  const onOpenRef = useRef(onOpenNote);
  onOpenRef.current = onOpenNote;
  const groupsRef = useRef<GraphGroup[]>(groups);
  groupsRef.current = groups;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const activeRef = useRef(activeId ?? null);
  activeRef.current = activeId ?? null;

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const pointerHoverRef = useRef<string | null>(null);

  // Build the simulation graph whenever the data or filters change.
  useEffect(() => {
    const query = filter.trim().toLowerCase();
    const allowed = new Set(
      data.nodes
        .filter((node) => showUnresolved || !node.unresolved)
        .filter((node) => showOrphans || node.degree > 0)
        .filter((node) => !query || node.title.toLowerCase().includes(query) || node.folder.toLowerCase().includes(query))
        .map((node) => node.id),
    );
    const filteredNodes = data.nodes.filter((node) => allowed.has(node.id));
    const nodes: SimNode[] = filteredNodes.map((node, index) => {
      const cached = positionsCache.get(node.id);
      const radius = node.unresolved ? 2.2 : 2.6 + Math.min(7.5, Math.sqrt(node.degree) * 1.8);
      const angle = index * 2.399963;
      const spread = 42 + Math.sqrt(index + 1) * (compact ? 12 : 26);
      return {
        id: node.id,
        title: node.title,
        path: node.path,
        folder: node.folder,
        degree: node.degree,
        unresolved: node.unresolved,
        x: cached?.x ?? Math.cos(angle) * spread,
        y: cached?.y ?? Math.sin(angle) * spread,
        vx: 0,
        vy: 0,
        r: radius,
        index,
      };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links: SimLink[] = [];
    const seen = new Set<string>();
    for (const link of data.links) {
      const source = byId.get(link.source);
      const target = byId.get(link.target);
      if (!source || !target || source === target) continue;
      const key = source.id < target.id ? `${source.id}\u0000${target.id}` : `${target.id}\u0000${source.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source, target });
    }
    for (const node of nodes) positionsCache.set(node.id, { x: node.x, y: node.y });
    const sim = simRef.current;
    sim.nodes = nodes;
    sim.links = links;
    sim.byId = byId;
    sim.alpha = 1;
    sim.hoveredId = null;
    sim.selectedId = null;
    sim.selectedIds = new Set();
    sim.dragging = null;
    sim.autoFit = 50;
    sim.needsDraw = true;
    setTooltip(null);
    onSelectionChangeRef.current?.([]);
  }, [data, filter, showUnresolved, showOrphans, compact]);

  // Keep the selection in sync with the parent (for the group action).
  useEffect(() => {
    const sim = simRef.current;
    const next = new Set(selectedIds ?? []);
    const changed =
      next.size !== sim.selectedIds.size ||
      [...next].some((id) => !sim.selectedIds.has(id));
    if (!changed) return;
    sim.selectedIds = next;
    sim.selectedId = next.size > 0 ? (selectedIds?.[selectedIds.length - 1] ?? null) : null;
    sim.needsDraw = true;
  }, [selectedIds]);

  // Keep the canvas sized to its container.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const sim = simRef.current;
      sim.width = rect.width;
      sim.height = rect.height;
      sim.dpr = dpr;
      sim.needsDraw = true;
      sim.autoFit = Math.max(sim.autoFit, 2);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const fit = () => {
    const sim = simRef.current;
    if (!sim.nodes.length || !sim.width || !sim.height) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of sim.nodes) {
      minX = Math.min(minX, node.x - node.r);
      minY = Math.min(minY, node.y - node.r);
      maxX = Math.max(maxX, node.x + node.r);
      maxY = Math.max(maxY, node.y + node.r);
    }
    const padding = compact ? 16 : 52;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const k = Math.max(
      0.2,
      Math.min(compact ? 1.1 : 1.9, (sim.width - padding * 2) / width, (sim.height - padding * 2) / height),
    );
    sim.k = k;
    sim.tx = -((minX + maxX) / 2) * k;
    sim.ty = -((minY + maxY) / 2) * k;
    sim.needsDraw = true;
  };

  const zoomBy = (factor: number, centerX?: number, centerY?: number) => {
    const sim = simRef.current;
    const cx = centerX ?? sim.width / 2;
    const cy = centerY ?? sim.height / 2;
    const newK = Math.max(0.18, Math.min(4, sim.k * factor));
    const worldX = (cx - sim.width / 2 - sim.tx) / sim.k;
    const worldY = (cy - sim.height / 2 - sim.ty) / sim.k;
    sim.k = newK;
    sim.tx = cx - sim.width / 2 - worldX * newK;
    sim.ty = cy - sim.height / 2 - worldY * newK;
    sim.needsDraw = true;
  };

  useImperativeHandle(ref, () => ({
    fit,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(0.8),
  }));

  // Physics + rendering loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let raf = 0;

    const applyPair = (a: SimNode, b: SimNode, alpha: number) => {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist2 = dx * dx + dy * dy;
      if (dist2 < 0.01) {
        dx = (Math.random() - 0.5) * 2;
        dy = (Math.random() - 0.5) * 2;
        dist2 = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(dist2);
      const force = (optionsRef.current.repulsion / Math.max(dist2, 140)) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
      const collision = a.r + b.r + 7;
      if (dist < collision) {
        const push = ((collision - dist) / dist) * 0.5;
        const dragged = simRef.current.dragging;
        if (dragged !== a) {
          a.x -= dx * push;
          a.y -= dy * push;
        }
        if (dragged !== b) {
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    };

    const step = () => {
      const sim = simRef.current;
      const alpha = sim.alpha;
      if (alpha <= 0.003 || sim.nodes.length === 0) return;
      const nodes = sim.nodes;
      const n = nodes.length;
      const gravity = optionsRef.current.gravity;
      if (n <= 300) {
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) applyPair(nodes[i], nodes[j], alpha);
        }
      } else {
        const cell = 150;
        const grid = new Map<string, SimNode[]>();
        for (const node of nodes) {
          const key = `${Math.floor(node.x / cell)},${Math.floor(node.y / cell)}`;
          const bucket = grid.get(key);
          if (bucket) bucket.push(node);
          else grid.set(key, [node]);
        }
        for (const node of nodes) {
          const gx = Math.floor(node.x / cell);
          const gy = Math.floor(node.y / cell);
          for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
              const bucket = grid.get(`${gx + ox},${gy + oy}`);
              if (!bucket) continue;
              for (const other of bucket) {
                if (other.index > node.index) applyPair(node, other, alpha);
              }
            }
          }
        }
      }

      for (const link of sim.links) {
        const dx = link.target.x - link.source.x;
        const dy = link.target.y - link.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const delta = dist - optionsRef.current.linkDistance;
        const force = delta * 0.0016 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        link.source.vx += fx;
        link.source.vy += fy;
        link.target.vx -= fx;
        link.target.vy -= fy;
      }

      for (const node of nodes) {
        const isDragged = sim.dragging === node;
        node.vx -= node.x * gravity * alpha;
        node.vy -= node.y * gravity * alpha;
        if (!isDragged) {
          node.x += Math.max(-24, Math.min(24, node.vx));
          node.y += Math.max(-24, Math.min(24, node.vy));
          node.vx *= 0.84;
          node.vy *= 0.84;
        } else {
          node.vx = 0;
          node.vy = 0;
        }
      }
      sim.alpha = alpha * (optionsRef.current.compact ? 0.974 : 0.988);
      sim.needsDraw = true;
      if (frame % 12 === 0) {
        for (const node of sim.nodes) positionsCache.set(node.id, { x: node.x, y: node.y });
      }
    };

    const draw = () => {
      const sim = simRef.current;
      const nodeCount = sim.nodes.length;
      if (nodeCount === 0 || !sim.width || !sim.height) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const palette = paletteRef.current;
      const { width, height, dpr, k } = sim;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const hovered = sim.hoveredId ? sim.byId.get(sim.hoveredId) : null;
      const selected = sim.selectedId ? sim.byId.get(sim.selectedId) : null;
      const focusNode = hovered ?? selected;
      const neighbors = new Set<string>();
      if (focusNode) {
        neighbors.add(focusNode.id);
        for (const link of sim.links) {
          if (link.source === focusNode) neighbors.add(link.target.id);
          else if (link.target === focusNode) neighbors.add(link.source.id);
        }
      }

      ctx.save();
      ctx.translate(width / 2 + sim.tx, height / 2 + sim.ty);
      ctx.scale(k, k);

      // Edges.
      ctx.lineWidth = 1.35 / k;
      for (const link of sim.links) {
        const highlighted =
          focusNode != null && (link.source === focusNode || link.target === focusNode);
        const faded = focusNode != null && !highlighted;
        const missing = link.source.unresolved || link.target.unresolved;
        ctx.beginPath();
        ctx.strokeStyle = highlighted ? palette.edgeActive : palette.edge;
        if (missing) {
          // Links to notes that do not exist stay visible but recede.
          ctx.setLineDash([4 / k, 4 / k]);
          ctx.globalAlpha = faded ? 0.12 : highlighted ? 0.85 : 0.6;
        } else {
          ctx.setLineDash([]);
          ctx.globalAlpha = faded ? 0.22 : 1;
        }
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      // Nodes. Missing notes are painted first so real notes always stay on top.
      const paintNode = (node: SimNode) => {
        const faded = focusNode != null && !neighbors.has(node.id);
        const isActive = activeRef.current === node.id;
        const isHovered = hovered === node;
        const isSelected = sim.selectedIds.has(node.id);
        const group = node.unresolved ? null : groupForNode(node, groupsRef.current);
        // Keep dots readable when the graph is zoomed far out.
        const minScreenRadius = node.unresolved ? 2.4 : 2;
        const radius = Math.max(node.r, minScreenRadius / Math.max(0.12, k));
        if (node.unresolved) {
          // Hollow dashed rings match the legend and never look like real notes.
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius * 1.15, 0, Math.PI * 2);
          ctx.fillStyle = palette.unresolved;
          ctx.globalAlpha = (isHovered ? 0.24 : 0.12) * (faded ? 0.3 : 1);
          ctx.fill();
          ctx.globalAlpha = faded ? 0.32 : 1;
          ctx.strokeStyle = isHovered ? palette.unresolvedHover : palette.unresolved;
          ctx.lineWidth = (isHovered ? 1.6 : 1.25) / k;
          ctx.setLineDash([2 / k, 1.8 / k]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        } else {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = group?.color ?? (isHovered ? palette.nodeHover : palette.node);
          ctx.globalAlpha = faded ? 0.38 : 1;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (isActive || isHovered || isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + (isSelected ? 4 / k : 3 / k), 0, Math.PI * 2);
          ctx.strokeStyle = isActive
            ? palette.active
            : node.unresolved
              ? palette.unresolvedHover
              : palette.nodeHover;
          ctx.lineWidth = (isSelected ? 2 : 1.6) / k;
          ctx.globalAlpha = faded ? 0.45 : 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      };
      for (const node of sim.nodes) if (node.unresolved) paintNode(node);
      for (const node of sim.nodes) if (!node.unresolved) paintNode(node);
      ctx.restore();

      // Labels in screen space so they stay crisp.
      if (optionsRef.current.labels && k >= 0.3) {
        const showAll = nodeCount <= 350 || k > 0.8;
        ctx.font = `${compact ? 10 : 11}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.lineJoin = "round";
        for (const node of sim.nodes) {
          if (!showAll && !neighbors.has(node.id) && activeRef.current !== node.id) continue;
          const sx = width / 2 + sim.tx + node.x * k;
          const sy = height / 2 + sim.ty + node.y * k + node.r * k + 4;
          if (sx < -120 || sx > width + 120 || sy < -20 || sy > height + 20) continue;
          const text = node.title.length > 34 ? `${node.title.slice(0, 33)}…` : node.title;
          ctx.globalAlpha = focusNode != null && !neighbors.has(node.id) ? 0.42 : 1;
          ctx.strokeStyle = palette.labelHalo;
          ctx.lineWidth = 3;
          ctx.strokeText(text, sx, sy);
          ctx.fillStyle = node.unresolved
            ? palette.unresolved
            : neighbors.has(node.id) || activeRef.current === node.id
              ? palette.nodeHover
              : palette.label;
          ctx.fillText(text, sx, sy);
          ctx.globalAlpha = 1;
        }
      }
    };

    const loop = () => {
      frame++;
      const sim = simRef.current;
      if (sim.autoFit > 0) {
        sim.autoFit -= 1;
        if (sim.autoFit === 0) fit();
      }
      if (sim.alpha > 0.003) step();
      if (sim.needsDraw || sim.alpha > 0.003 || sim.dragging) {
        draw();
        sim.needsDraw = false;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  useEffect(() => {
    simRef.current.needsDraw = true;
  }, [activeId, labels, groups]);

  // Wheel zoom needs a non-passive listener.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomBy(factor, event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointerPosition = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
      screenX: event.clientX - (rect?.left ?? 0),
      screenY: event.clientY - (rect?.top ?? 0),
    };
  };

  const hitTest = (screenX: number, screenY: number): SimNode | null => {
    const sim = simRef.current;
    const worldX = (screenX - sim.width / 2 - sim.tx) / sim.k;
    const worldY = (screenY - sim.height / 2 - sim.ty) / sim.k;
    for (let i = sim.nodes.length - 1; i >= 0; i--) {
      const node = sim.nodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const hitRadius = Math.max(node.r, compact ? 7 : 5) + 4 / sim.k;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return node;
    }
    return null;
  };

  const updateHover = (node: SimNode | null, screenX: number, screenY: number) => {
    const sim = simRef.current;
    const id = node?.id ?? null;
    if (sim.hoveredId !== id) {
      sim.hoveredId = id;
      sim.needsDraw = true;
      pointerHoverRef.current = id;
    }
    if (node) {
      setTooltip({
        id: node.id,
        x: screenX,
        y: screenY,
        title: node.title,
        folder: node.folder,
        degree: node.degree,
        unresolved: node.unresolved,
      });
    } else {
      setTooltip(null);
    }
  };

  return (
    <div className={`graph-canvas-wrap ${compact ? "compact" : ""}`} ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const { x, y } = pointerPosition(event);
          const node = hitTest(x, y);
          const sim = simRef.current;
          sim.lastPointer = { x, y };
          sim.dragMoved = false;
          canvasRef.current?.setPointerCapture(event.pointerId);
          if (node) {
            if (!event.shiftKey) {
              sim.selectedIds = new Set([node.id]);
              sim.selectedId = node.id;
              onSelectionChangeRef.current?.(Array.from(sim.selectedIds));
            }
            sim.dragging = node;
            sim.needsDraw = true;
          } else {
            sim.panning = true;
            sim.selectedId = null;
            sim.selectedIds = new Set();
            onSelectionChangeRef.current?.([]);
            sim.needsDraw = true;
          }
        }}
        onPointerMove={(event) => {
          const { x, y } = pointerPosition(event);
          const sim = simRef.current;
          if (sim.dragging) {
            const worldX = (x - sim.width / 2 - sim.tx) / sim.k;
            const worldY = (y - sim.height / 2 - sim.ty) / sim.k;
            sim.dragging.x = worldX;
            sim.dragging.y = worldY;
            positionsCache.set(sim.dragging.id, { x: worldX, y: worldY });
            if (Math.abs(x - sim.lastPointer.x) + Math.abs(y - sim.lastPointer.y) > 1) {
              sim.dragMoved = true;
              sim.alpha = Math.max(sim.alpha, 0.4);
            }
            sim.needsDraw = true;
            updateHover(sim.dragging, x, y);
            return;
          }
          if (sim.panning) {
            sim.tx += x - sim.lastPointer.x;
            sim.ty += y - sim.lastPointer.y;
            sim.lastPointer = { x, y };
            sim.dragMoved = true;
            sim.needsDraw = true;
            setTooltip(null);
            return;
          }
          const node = hitTest(x, y);
          updateHover(node, x, y);
          if (canvasRef.current) {
            canvasRef.current.style.cursor = node ? "pointer" : "grab";
          }
        }}
        onPointerUp={(event) => {
          const sim = simRef.current;
          const { x, y } = pointerPosition(event);
          const node = hitTest(x, y);
          const wasDragging = sim.dragging;
          const moved = sim.dragMoved;
          sim.dragging = null;
          sim.panning = false;
          canvasRef.current?.releasePointerCapture(event.pointerId);
          if (wasDragging && !moved) {
            if (compact && wasDragging.path) {
              onOpenRef.current(wasDragging.path);
            } else {
              const simNow = simRef.current;
              if (event.shiftKey) {
                const next = new Set(simNow.selectedIds);
                if (next.has(wasDragging.id)) next.delete(wasDragging.id);
                else next.add(wasDragging.id);
                simNow.selectedIds = next;
                simNow.selectedId = next.has(wasDragging.id)
                  ? wasDragging.id
                  : Array.from(next).pop() ?? null;
              } else {
                simNow.selectedIds = new Set([wasDragging.id]);
                simNow.selectedId = wasDragging.id;
              }
              simNow.needsDraw = true;
              onSelectionChangeRef.current?.(Array.from(simNow.selectedIds));
            }
          } else if (!wasDragging && !moved && !node) {
            sim.selectedId = null;
            sim.selectedIds = new Set();
            onSelectionChangeRef.current?.([]);
            sim.needsDraw = true;
          }
        }}
        onPointerLeave={() => {
          const sim = simRef.current;
          if (!sim.dragging && !sim.panning) {
            updateHover(null, 0, 0);
          }
        }}
        onDoubleClick={(event) => {
          const { x, y } = pointerPosition(event);
          const node = hitTest(x, y);
          if (node && node.path) onOpenRef.current(node.path);
        }}
      />
      {!compact && tooltip && (
        <div
          className="graph-tooltip"
          style={{
            left: Math.min(tooltip.x + 16, (simRef.current.width || 0) - 210),
            top: Math.min(tooltip.y + 18, (simRef.current.height || 0) - 80),
          }}
        >
          <div className="graph-tooltip-title">
            {tooltip.unresolved ? <span className="graph-tooltip-unresolved">{t("Unresolved")}</span> : null}
            {tooltip.title}
          </div>
          {tooltip.folder && <div className="graph-tooltip-folder">{tooltip.folder}</div>}
          <div className="graph-tooltip-meta">
            {tooltip.degree} {plural(tooltip.degree, { en: ["link", "links"], ru: ["связь", "связи", "связей"] })}
          </div>
        </div>
      )}
    </div>
  );
});
