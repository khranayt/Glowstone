import { useEffect, useMemo, useState } from "react";
import { parse as parseYaml } from "yaml";
import { RefreshCw, Table2, Code2 } from "lucide-react";
import { useAppStore } from "../store";
import { useT } from "../lib/useT";
import { getLanguage, plural } from "../lib/i18n";
import type { FileNode, Tab } from "../types";
import { api } from "../lib/api";
import { flattenNotes } from "../lib/utils";

interface BaseViewConfig {
  name?: string;
  type?: string;
  order?: string[];
  sort?: Array<{ property?: string; direction?: string }>;
  filters?: unknown;
}

interface BaseConfig {
  filters?: unknown;
  views?: BaseViewConfig[];
}

interface Row {
  path: string;
  title: string;
  folder: string;
  ext: string;
  modified?: number;
  created?: number;
  tags: string[];
  note: Record<string, unknown>;
}

const propertyValue = (row: Row, property: string): unknown => {
  switch (property) {
    case "file.name":
    case "file.basename":
      return row.title;
    case "file.folder":
      return row.folder;
    case "file.path":
      return row.path;
    case "file.ext":
      return row.ext;
    case "file.mtime":
      return row.modified;
    case "file.ctime":
      return row.created;
    case "file.tags":
      return row.tags;
    default:
      if (property.startsWith("note.")) return row.note[property.slice(5)];
      if (property.startsWith("file.")) return undefined;
      return row.note[property];
  }
};

const asText = (value: unknown): string => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(asText).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const compare = (value: unknown, operator: string, expected: string): boolean => {
  const text = asText(value).toLowerCase();
  const wanted = expected.toLowerCase();
  switch (operator) {
    case "==":
      return text === wanted;
    case "!=":
      return text !== wanted;
    case "contains":
      return text.includes(wanted);
    case "startsWith":
      return text.startsWith(wanted);
    case "endsWith":
      return text.endsWith(wanted);
    case ">":
      return Number(value) > Number(expected);
    case ">=":
      return Number(value) >= Number(expected);
    case "<":
      return Number(value) < Number(expected);
    case "<=":
      return Number(value) <= Number(expected);
    default:
      return true;
  }
};

const evalFilter = (filter: unknown, row: Row): boolean => {
  if (filter == null || filter === "") return true;
  if (typeof filter === "string") {
    const tag = /^file\.hasTag\(["'](.+)["']\)$/.exec(filter.trim());
    if (tag) return row.tags.some((value) => value.toLowerCase() === tag[1].toLowerCase());
    const match =
      /^([A-Za-z0-9_.]+)\s*(==|!=|>=|<=|>|<|contains|startsWith|endsWith)\s*["']?(.*?)["']?$/.exec(
        filter.trim(),
      );
    if (!match) return true;
    return compare(propertyValue(row, match[1]), match[2], match[3]);
  }
  if (Array.isArray(filter)) return filter.every((entry) => evalFilter(entry, row));
  if (typeof filter === "object") {
    const entry = filter as Record<string, unknown>;
    if (Array.isArray(entry.and)) return entry.and.every((item) => evalFilter(item, row));
    if (Array.isArray(entry.or)) return entry.or.some((item) => evalFilter(item, row));
    if (entry.not != null) return !evalFilter(entry.not, row);
  }
  return true;
};

const parseFrontmatter = (content: string): Record<string, unknown> => {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end < 0) return {};
  try {
    const parsed = parseYaml(content.slice(3, end));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const tagsOf = (note: Record<string, unknown>, content: string): string[] => {
  const tags = new Set<string>();
  const raw = note.tags ?? note.tag;
  if (Array.isArray(raw)) raw.forEach((value) => tags.add(String(value).replace(/^#/, "")));
  else if (typeof raw === "string") {
    raw.split(/[,\s]+/).forEach((value) => {
      const clean = value.trim().replace(/^#/, "");
      if (clean) tags.add(clean);
    });
  }
  for (const match of content.matchAll(/(?:^|\s)#([A-Za-z0-9_/-]+)/g)) {
    tags.add(match[1]);
  }
  return [...tags];
};

const formatTime = (value?: number) => {
  if (!value) return "";
  return new Date(value * 1000).toLocaleDateString(getLanguage() === "ru" ? "ru-RU" : "en-US");
};

const propertyLabel = (property: string) => {
  if (property.startsWith("file.")) {
    const key = property.slice(5);
    return key === "name" ? "Name" : key === "folder" ? "Folder" : key === "mtime" ? "Modified" : key === "ctime" ? "Created" : key === "tags" ? "Tags" : key;
  }
  if (property.startsWith("note.")) return property.slice(5);
  return property;
};

export function BaseView({ tab }: { tab: Tab }) {
  const t = useT();
  const vault = useAppStore((s) => s.vault);
  const tree = useAppStore((s) => s.tree);
  const setTabContent = useAppStore((s) => s.setTabContent);
  const openNote = useAppStore((s) => s.openNote);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);
  const [source, setSource] = useState(false);

  const parsed = useMemo(() => {
    try {
      const value = parseYaml(tab.content);
      if (!value || typeof value !== "object") return { config: { views: [] } as BaseConfig, error: null };
      return { config: value as BaseConfig, error: null };
    } catch (error) {
      return { config: { views: [] } as BaseConfig, error: String(error) };
    }
  }, [tab.content]);

  const views = useMemo(() => {
    const list = Array.isArray(parsed.config.views) ? parsed.config.views : [];
    return list.length > 0 ? list : [{ type: "table", name: "Table" }];
  }, [parsed.config]);
  const view = views[Math.min(viewIndex, views.length - 1)];
  const order = view?.order?.length
    ? view.order
    : ["file.name", "file.folder", "file.mtime"];

  const needsContent = useMemo(() => {
    const text = `${JSON.stringify(parsed.config)} ${JSON.stringify(view ?? {})}`;
    return /note\.|file\.tags|hasTag/.test(text);
  }, [parsed.config, view]);

  const load = async () => {
    if (!vault) return;
    setLoading(true);
    const notes = flattenNotes(tree);
    const result = await Promise.all(
      notes.map(async (note) => {
        const file = findNode(tree, note.path);
        let noteData: Record<string, unknown> = {};
        let tags: string[] = [];
        if (needsContent) {
          try {
            const content = await api.readFile(note.path);
            noteData = parseFrontmatter(content);
            tags = tagsOf(noteData, content);
          } catch {
            /* ignore unreadable notes */
          }
        }
        return {
          path: note.path,
          title: note.title,
          folder: note.folder,
          ext: "md",
          modified: file?.modified,
          created: file?.created,
          tags,
          note: noteData,
        } satisfies Row;
      }),
    );
    setRows(result);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, tab.path, needsContent]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter(
      (row) => evalFilter(parsed.config.filters, row) && evalFilter(view?.filters, row),
    );
    const sort = view?.sort?.[0];
    if (sort?.property) {
      const direction = sort.direction === "desc" ? -1 : 1;
      filtered.sort((a, b) =>
        asText(propertyValue(a, sort.property!)).localeCompare(
          asText(propertyValue(b, sort.property!)),
        ) * direction,
      );
    }
    return filtered;
  }, [rows, parsed.config.filters, view]);

  const cell = (row: Row, property: string) => {
    if (property === "file.name" || property === "file.basename") {
      return (
        <button className="base-link" onClick={() => void openNote(row.path)}>
          {row.title}
        </button>
      );
    }
    if (property === "file.mtime" || property === "file.ctime") {
      return formatTime(propertyValue(row, property) as number);
    }
    return asText(propertyValue(row, property));
  };

  return (
    <div className="note-view special-view base-view">
      <header className="note-header special-header">
        <div className="note-header-left">
          <span className="graph-header-icon">
            <Table2 size={16} />
          </span>
          <span className="note-header-title">{tab.title}</span>
          {views.length > 1 && (
            <select
              className="base-view-select"
              value={viewIndex}
              onChange={(event) => setViewIndex(Number(event.target.value))}
            >
              {views.map((entry, index) => (
                <option key={`${entry.name}-${index}`} value={index}>
                  {entry.name || t("View {n}", { n: index + 1 })}
                </option>
              ))}
            </select>
          )}
          <span className="special-meta">
            {visibleRows.length} {plural(visibleRows.length, { en: ["row", "rows"], ru: ["строка", "строки", "строк"] })}
          </span>
        </div>
        <div className="note-header-actions">
          <button
            className={`icon-button ${source ? "active" : ""}`}
            onClick={() => setSource((value) => !value)}
            title={source ? t("Table") : t("Open file")}
            aria-label={source ? t("Table") : t("Open file")}
          >
            {source ? <Table2 size={16} /> : <Code2 size={16} />}
          </button>
          <button
            className="icon-button"
            onClick={() => void load()}
            title={t("Refresh")}
            aria-label={t("Refresh")}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      {source ? (
        <div className="base-source">
          <textarea
            value={tab.content}
            spellCheck={false}
            onChange={(event) => setTabContent(tab.id, event.target.value)}
          />
        </div>
      ) : parsed.error ? (
        <div className="base-error">
          <p>{parsed.error}</p>
          <button className="btn btn-secondary" onClick={() => setSource(true)}>
            {t("Open file")}
          </button>
        </div>
      ) : (
        <div className="base-table-wrap">
          <table className="base-table">
            <thead>
              <tr>
                {order.map((property) => (
                  <th key={property}>{t(propertyLabel(property))}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.path}>
                  {order.map((property) => (
                    <td key={property}>{cell(row, property)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && !loading && (
            <div className="base-empty">{t("No rows")}</div>
          )}
        </div>
      )}
    </div>
  );
}

const findNode = (nodes: FileNode[], path: string): FileNode | undefined => {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.isDir) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
};
