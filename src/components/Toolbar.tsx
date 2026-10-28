import { useEffect, useRef, useState } from "react";
import {
  Baseline,
  Bold,
  Braces,
  Code2,
  Eraser,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  MoreHorizontal,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
  Highlighter,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store";
import { runEditorCommand, insertTable, insertAttachment } from "../editor/commands";
import { isTauri, api } from "../lib/api";
import {
  attachmentFolderFor,
  attachmentMarkdown,
} from "../lib/attachments";
import { basename } from "../lib/utils";
import { Popover } from "./Popover";

const colors = ["#e3b341", "#e06c75", "#98c379", "#61afef", "#c678dd", "#56b6c2"];

function ToolButton({
  label,
  shortcut,
  onClick,
  children,
  active,
  optional,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  optional?: boolean;
}) {
  return (
    <button
      className={`toolbar-button ${active ? "active" : ""} ${optional ? "toolbar-optional" : ""}`}
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

const HeadingButton = ({ level }: { level: 1 | 2 | 3 }) => {
  return (
    <button
      className="toolbar-button toolbar-heading"
      onClick={() => runEditorCommand(`heading${level}` as "heading1" | "heading2" | "heading3")}
      title={`Heading ${level}`}
      aria-label={`Heading ${level}`}
    >
      H{level}
    </button>
  );
};

export function EditorToolbar() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [tableSize, setTableSize] = useState({ rows: 3, cols: 3 });

  // Drop low-priority buttons when the note pane gets narrow, rather than
  // letting the toolbar clip behind the sidebar.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const fit = () => {
      bar.classList.remove("compact");
      if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add("compact");
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const run = (command: Parameters<typeof runEditorCommand>[0]) => () => {
    runEditorCommand(command);
  };

  const pickImage = async () => {
    const state = useAppStore.getState();
    if (!state.vault) {
      state.toast("Open a vault before adding an image", "error");
      return;
    }
    const active = state.tabs.find((item) => item.id === state.activeTabId);
    if (!active || active.kind !== "note" || !active.path) {
      state.toast("Open a note before adding an image", "error");
      return;
    }
    if (!isTauri()) {
      runEditorCommand("image");
      return;
    }
    try {
      const selected = await openDialog({
        multiple: true,
        title: "Add images",
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"],
          },
        ],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;
      const folder = attachmentFolderFor(state.vault.path, active.path, state.settings);
      for (const source of paths) {
        try {
          const saved = await api.copyAttachment(state.vault.path, folder, source);
          insertAttachment(
            attachmentMarkdown(state.vault.path, active.path, saved, basename(source)),
          );
          state.expandToPath(saved);
        } catch (error) {
          state.toast(`Could not add image: ${String(error)}`, "error");
        }
      }
      await state.refreshTree();
    } catch (error) {
      state.toast(`Could not open the image picker: ${String(error)}`, "error");
    }
  };

  const toggleFullscreen = async () => {
    if (!isTauri()) return;
    try {
      const win = getCurrentWindow();
      const full = await win.isFullscreen();
      await win.setFullscreen(!full);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting" ref={barRef}>
      <div className="toolbar-group">
        <ToolButton label="Undo" shortcut="Ctrl+Z" onClick={run("undo")}>
          <Undo2 size={16} />
        </ToolButton>
        <ToolButton label="Redo" shortcut="Ctrl+Shift+Z" onClick={run("redo")}>
          <Redo2 size={16} />
        </ToolButton>
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <ToolButton label="Inline code" shortcut="Ctrl+`" onClick={run("inlineCode")}>
          <Braces size={16} />
        </ToolButton>
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <HeadingButton level={1} />
        <HeadingButton level={2} />
        <HeadingButton level={3} />
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <ToolButton label="Bold" shortcut="Ctrl+B" onClick={run("bold")}>
          <Bold size={16} />
        </ToolButton>
        <ToolButton label="Italic" shortcut="Ctrl+I" onClick={run("italic")}>
          <Italic size={16} />
        </ToolButton>
        <ToolButton label="Strikethrough" shortcut="Ctrl+Shift+X" onClick={run("strike")}>
          <Strikethrough size={16} />
        </ToolButton>
        <ToolButton label="Underline" onClick={run("underline")} optional>
          <Underline size={16} />
        </ToolButton>
        <ToolButton label="Highlight" shortcut="Ctrl+Shift+H" onClick={run("highlight")}>
          <Highlighter size={16} />
        </ToolButton>
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <ToolButton label="Code block" onClick={run("codeBlock")}>
          <Code2 size={16} />
        </ToolButton>
        <ToolButton label="Link" shortcut="Ctrl+K" onClick={run("link")}>
          <Link2 size={16} />
        </ToolButton>
        <button
          className="toolbar-button toolbar-wikilink"
          onClick={run("wikilink")}
          title="Wikilink"
          aria-label="Wikilink"
        >
          [[ ]]
        </button>
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <Popover
          align="left"
          width={214}
          trigger={({ toggle, open }) => (
            <button
              className={`toolbar-button ${open ? "active" : ""}`}
              onClick={toggle}
              title="Insert table"
              aria-label="Insert table"
            >
              <TableIcon size={16} />
            </button>
          )}
        >
          {(close) => (
            <div className="table-picker">
              <div
                className="table-picker-grid"
                onMouseLeave={() => setTableSize({ rows: 3, cols: 3 })}
              >
                {Array.from({ length: 8 }, (_, row) =>
                  Array.from({ length: 8 }, (_, column) => {
                    const rows = row + 1;
                    const cols = column + 1;
                    const selected = rows <= tableSize.rows && cols <= tableSize.cols;
                    return (
                      <button
                        key={`${rows}-${cols}`}
                        className={`table-picker-cell ${selected ? "active" : ""}`}
                        onMouseEnter={() => setTableSize({ rows, cols })}
                        onClick={() => {
                          insertTable(rows, cols);
                          setTableSize({ rows: 3, cols: 3 });
                          close();
                        }}
                        title={`${rows} × ${cols} table`}
                        aria-label={`Insert ${rows} by ${cols} table`}
                      />
                    );
                  }),
                )}
              </div>
              <div className="table-picker-label">
                {tableSize.rows} × {tableSize.cols} table
              </div>
              <button
                className="menu-item table-picker-format"
                onClick={() => {
                  runEditorCommand("formatTable");
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>Format table at cursor</span>
              </button>
            </div>
          )}
        </Popover>
        <ToolButton label="Task list" onClick={run("taskList")}>
          <ListChecks size={16} />
        </ToolButton>
        <ToolButton label="Image" onClick={() => void pickImage()}>
          <ImageIcon size={16} />
        </ToolButton>
        <ToolButton label="Quote" onClick={run("quote")}>
          <Quote size={16} />
        </ToolButton>
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <ToolButton label="Bullet list" onClick={run("bulletList")}>
          <List size={16} />
        </ToolButton>
        <ToolButton label="Numbered list" onClick={run("numberedList")}>
          <ListOrdered size={16} />
        </ToolButton>
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <Popover
          align="right"
          width={168}
          trigger={({ toggle, open }) => (
            <button
              className={`toolbar-button ${open ? "active" : ""}`}
              onClick={toggle}
              title="Text color"
              aria-label="Text color"
            >
              <Baseline size={16} />
            </button>
          )}
        >
          {(close) => (
            <div className="color-menu">
              {colors.map((color) => (
                <button
                  key={color}
                  className="color-swatch"
                  style={{ background: color }}
                  title={color}
                  onClick={() => {
                    runEditorCommand(`color:${color}`);
                    close();
                  }}
                />
              ))}
            </div>
          )}
        </Popover>
        <ToolButton label="Clear formatting" onClick={run("clear")} optional>
          <Eraser size={16} />
        </ToolButton>
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-group">
        <ToolButton label="Toggle full screen" onClick={() => void toggleFullscreen()}>
          <Maximize2 size={16} />
        </ToolButton>
        <Popover
          align="right"
          width={210}
          trigger={({ toggle, open }) => (
            <button
              className={`toolbar-button ${open ? "active" : ""}`}
              onClick={toggle}
              title="More formatting options"
              aria-label="More formatting options"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                className="menu-item"
                onClick={() => {
                  runEditorCommand("underline");
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>Underline</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  runEditorCommand("clear");
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>Clear formatting</span>
              </button>
              <div className="menu-separator" />
              <button
                className="menu-item"
                onClick={() => {
                  runEditorCommand("callout");
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>Insert callout</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  runEditorCommand("divider");
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>Horizontal rule</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  runEditorCommand("formatTable");
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>Format table</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  runEditorCommand("math");
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>Math block</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  runEditorCommand("footnote");
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>Footnote</span>
              </button>
              <div className="menu-separator" />
              <button
                className="menu-item"
                onClick={() => {
                  updateSettings({ lineNumbers: !settings.lineNumbers });
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>{settings.lineNumbers ? "Hide" : "Show"} line numbers</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  updateSettings({ spellcheck: !settings.spellcheck });
                  close();
                }}
              >
                <span className="menu-icon-spacer" />
                <span>{settings.spellcheck ? "Disable" : "Enable"} spellcheck</span>
              </button>
            </>
          )}
        </Popover>
      </div>
    </div>
  );
}
