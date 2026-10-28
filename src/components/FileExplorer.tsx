import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  SquarePen,
  FolderPlus,
} from "lucide-react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../store";
import type { FileNode, MenuItem } from "../types";
import { isImagePath, isMarkdownPath } from "../lib/utils";
import { isTauri } from "../lib/api";

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = initial.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  return (
    <input
      ref={inputRef}
      className="tree-rename-input"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onBlur={() => {
        if (!cancelled.current) {
          if (value.trim() && value.trim() !== initial) onCommit(value.trim());
          else onCancel();
        }
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          inputRef.current?.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelled.current = true;
          onCancel();
        }
      }}
    />
  );
}

const iconFor = (node: FileNode) => {
  if (node.isDir) return <Folder size={15} />;
  if (isMarkdownPath(node.path)) return <FileText size={15} />;
  if (isImagePath(node.path)) return <ImageIcon size={15} />;
  return <File size={15} />;
};

export function FileExplorer() {
  const tree = useAppStore((s) => s.tree);
  const vault = useAppStore((s) => s.vault);
  const expanded = useAppStore((s) => s.expanded);
  const selectedPath = useAppStore((s) => s.selectedPath);
  const renamingPath = useAppStore((s) => s.renamingPath);
  const activePath = useAppStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.kind === "note" ? tab.path ?? null : null;
  });
  const toggleFolder = useAppStore((s) => s.toggleFolder);
  const selectPath = useAppStore((s) => s.selectPath);
  const openNote = useAppStore((s) => s.openNote);
  const createNote = useAppStore((s) => s.createNote);
  const createFolder = useAppStore((s) => s.createFolder);
  const commitRename = useAppStore((s) => s.commitRename);
  const startRename = useAppStore((s) => s.startRename);
  const deletePath = useAppStore((s) => s.deletePath);
  const setContextMenu = useAppStore((s) => s.setContextMenu);
  const movePath = useAppStore((s) => s.movePath);
  const refreshTree = useAppStore((s) => s.refreshTree);
  const toast = useAppStore((s) => s.toast);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activePath) return;
    const timer = window.setTimeout(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-path="${CSS.escape(activePath)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [activePath]);

  const reveal = (path: string) => {
    if (!isTauri()) return;
    void revealItemInDir(path).catch((error) => toast(String(error), "error"));
  };

  const copy = (path: string) => {
    void navigator.clipboard.writeText(path);
    toast("Path copied", "info");
  };

  const fileMenu = (node: FileNode): MenuItem[] => {
    const items: MenuItem[] = [];
    if (node.isDir) {
      items.push(
        { label: "New note", action: () => void createNote(node.path) },
        { label: "New folder", action: () => void createFolder(node.path) },
        { label: "", separator: true },
        { label: "Rename", action: () => startRename(node.path), shortcut: "F2" },
        { label: "Delete", action: () => deletePath(node.path), danger: true },
        { label: "", separator: true },
        { label: "Copy path", action: () => copy(node.path) },
        { label: "Reveal in file manager", action: () => reveal(node.path) },
      );
    } else {
      items.push(
        { label: "Open", action: () => void openNote(node.path) },
        {
          label: "Open in new tab",
          action: () => void openNote(node.path, { newTab: true }),
          shortcut: "Ctrl Enter",
        },
        { label: "", separator: true },
        { label: "Rename", action: () => startRename(node.path), shortcut: "F2" },
        { label: "Delete", action: () => deletePath(node.path), danger: true },
        { label: "", separator: true },
        { label: "Copy path", action: () => copy(node.path) },
        { label: "Reveal in file manager", action: () => reveal(node.path) },
      );
    }
    return items;
  };

  const rootMenu = (event: MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "New note", action: () => void createNote(vault?.path) },
        { label: "New folder", action: () => void createFolder(vault?.path) },
        { label: "", separator: true },
        { label: "Refresh", action: () => void refreshTree() },
        { label: "Copy vault path", action: () => vault && copy(vault.path) },
        ...(vault ? [{ label: "Reveal in file manager", action: () => reveal(vault.path) }] : []),
      ],
    });
  };

  const renderNode = (node: FileNode, depth: number) => {
    const open = node.isDir && !!expanded[node.path];
    const active = node.path === activePath;
    const selected = node.path === selectedPath;
    const isDropTarget = dropTarget === node.path && node.isDir;

    return (
      <div key={node.path} className="tree-branch">
        <div
          className={`tree-row ${active ? "tree-row-active" : ""} ${selected && !active ? "tree-row-selected" : ""} ${
            isDropTarget ? "tree-row-drop" : ""
          }`}
          style={{ paddingLeft: 8 + depth * 14 }}
          data-path={node.path}
          draggable={renamingPath !== node.path}
          onDragStart={(event) => {
            event.stopPropagation();
            setDragPath(node.path);
            event.dataTransfer.setData("text/plain", node.path);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragPath(null);
            setDropTarget(null);
          }}
          onDragOver={(event) => {
            if (!node.isDir || !dragPath || dragPath === node.path) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            setDropTarget(node.path);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDropTarget(null);
          }}
          onDrop={(event) => {
            if (!node.isDir) return;
            event.preventDefault();
            event.stopPropagation();
            const source = dragPath || event.dataTransfer.getData("text/plain");
            setDropTarget(null);
            setDragPath(null);
            if (source && source !== node.path) void movePath(source, node.path);
          }}
          onClick={(event) => {
            selectPath(node.path);
            if (node.isDir) {
              toggleFolder(node.path);
            } else if (isMarkdownPath(node.path)) {
              void openNote(node.path, { newTab: event.ctrlKey || event.metaKey });
            } else if (isTauri()) {
              void openPath(node.path).catch((error) => toast(String(error), "error"));
            }
          }}
          onAuxClick={(event) => {
            if (event.button === 1 && !node.isDir && isMarkdownPath(node.path)) {
              event.preventDefault();
              void openNote(node.path, { newTab: true });
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectPath(node.path);
            setContextMenu({ x: event.clientX, y: event.clientY, items: fileMenu(node) });
          }}
          title={node.name}
        >
          {node.isDir ? (
            <ChevronRight size={13} className={`tree-chevron ${open ? "open" : ""}`} />
          ) : (
            <span className="tree-chevron-spacer" />
          )}
          <span className={`tree-icon ${node.isDir ? "folder" : isMarkdownPath(node.path) ? "note" : ""}`}>
            {node.isDir && open ? <FolderOpen size={15} /> : iconFor(node)}
          </span>
          {renamingPath === node.path ? (
            <RenameInput
              initial={node.name}
              onCommit={(value) => void commitRename(node.path, value)}
              onCancel={() => startRename(null)}
            />
          ) : (
            <span className="tree-label">{node.name}</span>
          )}
        </div>
        {node.isDir && open && (
          <div className="tree-children">
            {node.children.length === 0 && (
              <div className="tree-empty-folder" style={{ paddingLeft: 28 + depth * 14 }}>
                Empty folder
              </div>
            )}
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="file-explorer"
      ref={scrollRef}
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) rootMenu(event);
      }}
      onDragOver={(event) => {
        if (!dragPath) return;
        event.preventDefault();
        setDropTarget("__root__");
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDropTarget(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const source = dragPath || event.dataTransfer.getData("text/plain");
        setDropTarget(null);
        setDragPath(null);
        if (source && vault && !source.startsWith(`${vault.path}/`)) return;
        if (source && vault) {
          const parent = source.slice(0, source.lastIndexOf("/"));
          if (parent !== vault.path) void movePath(source, vault.path);
        }
      }}
    >
      <div
        className={`tree-root ${dropTarget === "__root__" ? "tree-root-drop" : ""}`}
        onContextMenu={rootMenu}
      >
        {tree.map((node) => renderNode(node, 0))}
        {tree.length === 0 && (
          <div className="tree-empty">
            <FileText size={28} />
            <p>No notes yet</p>
            <button className="btn btn-secondary" onClick={() => void createNote(vault?.path)}>
              <SquarePen size={15} />
              Create a note
            </button>
            <button className="btn btn-ghost" onClick={() => void createFolder(vault?.path)}>
              <FolderPlus size={15} />
              New folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
