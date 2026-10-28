import type { FileNode, GraphData, Tab } from "../types";

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const basename = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
};

export const dirname = (path: string) => {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
};

export const stripExt = (name: string) => name.replace(/\.(md|markdown)$/i, "");

export const titleFromPath = (path: string) => stripExt(basename(path));

export const isMarkdownPath = (path: string) =>
  /\.(md|markdown)$/i.test(path);

export const isImagePath = (path: string) =>
  /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(path);

export const comparePath = (a: string, b: string) =>
  a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();

export const relPath = (root: string, path: string) => {
  const r = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const p = path.replace(/\\/g, "/");
  return p.startsWith(`${r}/`) ? p.slice(r.length + 1) : p;
};

export const joinPath = (dir: string, name: string) =>
  `${dir.replace(/\/+$/, "")}/${name}`;

export const normalizePath = (path: string) => {
  const out: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
};

/** Resolve a link/attachment reference relative to the current note. */
export const resolveRef = (vaultRoot: string, fromPath: string, ref: string) => {
  let clean = ref.trim().replace(/^<|>$/g, "");
  try {
    clean = decodeURIComponent(clean);
  } catch {
    /* keep raw */
  }
  if (!clean || /^[a-z]+:\/\//i.test(clean) || clean.startsWith("mailto:")) {
    return null;
  }
  clean = clean.split("|")[0].split("#")[0].split("?")[0];
  if (!clean) return null;
  if (clean.startsWith("/")) {
    return joinPath(vaultRoot, normalizePath(clean.slice(1)));
  }
  const base = dirname(relPath(vaultRoot, fromPath));
  return joinPath(vaultRoot, normalizePath(`${base}/${clean}`));
};

export interface FlatNote {
  path: string;
  title: string;
  folder: string;
  name: string;
}

export const flattenNotes = (tree: FileNode[]): FlatNote[] => {
  const out: FlatNote[] = [];
  const walk = (nodes: FileNode[], folderParts: string[]) => {
    for (const node of nodes) {
      if (node.isDir) {
        walk(node.children, [...folderParts, node.name]);
      } else if (isMarkdownPath(node.path)) {
        out.push({
          path: node.path,
          title: titleFromPath(node.path),
          folder: folderParts.join("/"),
          name: node.name,
        });
      }
    }
  };
  walk(tree, []);
  return out;
};

export const flattenAllFiles = (tree: FileNode[]): FileNode[] => {
  const out: FileNode[] = [];
  const walk = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.isDir) walk(node.children);
      else out.push(node);
    }
  };
  walk(tree);
  return out;
};

export const findNoteByLink = (
  tree: FileNode[],
  target: string,
  fromPath?: string,
): FlatNote | null => {
  const notes = flattenNotes(tree);
  let clean = target.split("|")[0].split("#")[0].trim();
  if (!clean) return null;
  clean = clean.replace(/\\/g, "/").replace(/\.md$/i, "");
  const lower = clean.toLowerCase();

  if (clean.includes("/")) {
    const exact = notes.find(
      (n) => n.folder.toLowerCase() === dirname(lower) && n.title.toLowerCase() === basename(lower),
    );
    if (exact) return exact;
    const relExact = notes.find((n) => {
      const rel = `${n.folder ? `${n.folder}/` : ""}${n.title}`.toLowerCase();
      return rel.endsWith(`/${lower}`) || rel === lower;
    });
    if (relExact) return relExact;
  }

  const byTitle = notes.find((n) => n.title.toLowerCase() === lower);
  if (byTitle) return byTitle;

  if (fromPath) {
    const fromFolder = dirname(relPath("", fromPath));
    const sibling = notes.find(
      (n) => n.folder.toLowerCase() === fromFolder.toLowerCase() && n.title.toLowerCase() === lower,
    );
    if (sibling) return sibling;
  }
  return null;
};

/** Small fuzzy matcher. Returns -1 when the query doesn't match. */
export const fuzzyScore = (query: string, text: string): number => {
  if (!query.trim()) return 0;
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] === ch) {
        found = i;
        break;
      }
    }
    if (found === -1) return -1;
    score += 12 - Math.min(10, found - ti);
    if (found === ti) streak += 1;
    else streak = 0;
    score += streak * 4;
    if (found === 0 || /[\s/_.-]/.test(t[found - 1])) score += 8;
    ti = found + 1;
  }
  score -= Math.max(0, t.length - q.length) * 0.25;
  return score;
};

export const fuzzyFilter = <T,>(items: T[], query: string, text: (item: T) => string): T[] => {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(query, text(item)) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
};

export const wordCount = (text: string) => {
  const words = text.trim().match(/[A-Za-z0-9\u00C0-\u024F\u0400-\u04FF]+(?:['’-][A-Za-z0-9\u00C0-\u024F\u0400-\u04FF]+)*/g);
  return words ? words.length : 0;
};

export const debounce = <A extends unknown[]>(fn: (...args: A) => void, ms: number) => {
  let handle: number | undefined;
  const wrapped = (...args: A) => {
    if (handle) window.clearTimeout(handle);
    handle = window.setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => {
    if (handle) window.clearTimeout(handle);
  };
  return wrapped;
};

export const noteIdFromPath = (vaultRoot: string, path: string) =>
  relPath(vaultRoot, path).replace(/\.(md|markdown)$/i, "");

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export const extractHeadings = (content: string): Heading[] => {
  const headings: Heading[] = [];
  let inFence = false;
  content.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].replace(/[*_`~]/g, "").trim() || "Untitled",
        line: index + 1,
      });
    }
  });
  return headings;
};

/** A cheap signature of the link structure of a note, used to avoid needless graph rebuilds. */
export const linkSignature = (content: string) => {
  const links = new Set<string>();
  for (const match of content.matchAll(/\[\[([^\]\n]{1,300})\]\]/g)) {
    links.add(match[1].split("|")[0].split("#")[0].trim().toLowerCase());
  }
  for (const match of content.matchAll(/\[[^\]\n]*\]\(\s*<?([^)>\s]+)/g)) {
    if (!/^[a-z]+:\/\//i.test(match[1]) && !match[1].startsWith("#")) {
      links.add(match[1].split("#")[0].trim().toLowerCase());
    }
  }
  return [...links].sort().join("|");
};

export const backlinksFor = (graph: GraphData | null, noteId: string) => {
  if (!graph) return [];
  const ids = new Set(graph.links.filter((l) => l.target === noteId).map((l) => l.source));
  return graph.nodes.filter((n) => ids.has(n.id));
};

export const outgoingFor = (graph: GraphData | null, noteId: string) => {
  if (!graph) return [];
  const ids = new Set(graph.links.filter((l) => l.source === noteId).map((l) => l.target));
  return graph.nodes.filter((n) => ids.has(n.id));
};

export const activeTabOf = (tabs: Tab[], activeId: string | null) =>
  tabs.find((t) => t.id === activeId) ?? null;

export const isExternalUrl = (href: string) =>
  /^(https?:|mailto:|tel:)/i.test(href);

export const prettyShortcut = (shortcut: string) =>
  navigator.userAgent.includes("Mac") ? shortcut.replace(/Ctrl/g, "⌘").replace(/Alt/g, "⌥") : shortcut;
