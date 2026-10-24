import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  FileText,
  Link2,
  ListTree,
  MoreHorizontal,
  Pencil,
  PanelRight,
  Trash2,
  ExternalLink,
  Type,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../store";
import type { Tab } from "../types";
import { attachmentUrl } from "../lib/attachments";
import { dirname, relPath, stripExt } from "../lib/utils";
import { Editor } from "../editor/Editor";
import { ReadingView } from "./ReadingView";
import { EditorToolbar } from "./Toolbar";
import { Popover } from "./Popover";
import { isTauri } from "../lib/api";

function InlineTitle({ tab }: { tab: Tab }) {
  const commitInlineTitle = useAppStore((s) => s.commitInlineTitle);
  const [draft, setDraft] = useState(tab.title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoFocused = useRef<string | null>(null);

  useEffect(() => {
    setDraft(tab.title);
  }, [tab.title, tab.path, tab.id]);

  useEffect(() => {
    if (!tab.path || autoFocused.current === tab.path) return;
    if (!/^untitled( \d+)?$/i.test(tab.title)) return;
    autoFocused.current = tab.path;
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);
  }, [tab.path, tab.title]);

  const commit = () => {
    const value = draft.trim();
    if (!value) {
      setDraft(tab.title);
      return;
    }
    if (value !== tab.title) void commitInlineTitle(value);
  };

  return (
    <input
      ref={inputRef}
      className="inline-title"
      value={draft}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(tab.title);
          event.currentTarget.blur();
        }
      }}
      aria-label="Note title"
      placeholder="Untitled"
    />
  );
}

export function NoteView({ tab }: { tab: Tab }) {
  const vault = useAppStore((s) => s.vault);
  const tree = useAppStore((s) => s.tree);
  const settings = useAppStore((s) => s.settings);
  const setTabContent = useAppStore((s) => s.setTabContent);
  const setCursor = useAppStore((s) => s.setCursor);
  const openLinkTarget = useAppStore((s) => s.openLinkTarget);
  const setMode = useAppStore((s) => s.setMode);
  const navigateHistory = useAppStore((s) => s.navigateHistory);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const rightPanel = useAppStore((s) => s.rightPanel);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const jumpRequest = useAppStore((s) => s.jumpRequest);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const deletePath = useAppStore((s) => s.deletePath);
  const setContextMenu = useAppStore((s) => s.setContextMenu);
  const toast = useAppStore((s) => s.toast);

  if (!tab.path || !vault) return null;
  const folder = dirname(relPath(vault.path, tab.path));
  const canBack = tab.historyIndex > 0;
  const canForward = tab.historyIndex < tab.history.length - 1;
  const readonly = tab.mode === "read";

  const openMore = (event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({
      x: rect.right - 6,
      y: rect.bottom + 4,
      items: [
        {
          label: "Rename note",
          action: () =>
            setPrompt({
              title: "Rename note",
              label: "Note name",
              initial: tab.title,
              confirmLabel: "Rename",
              onSubmit: (value) => useAppStore.getState().commitInlineTitle(value),
            }),
        },
        { label: "Delete note", action: () => deletePath(tab.path!), danger: true },
        { label: "", separator: true },
        { label: "Copy vault path", action: () => void navigator.clipboard.writeText(tab.path!) },
        {
          label: "Reveal in file manager",
          action: () => {
            if (!isTauri()) return;
            void revealItemInDir(tab.path!).catch((error) => toast(String(error), "error"));
          },
        },
        { label: "", separator: true },
        {
          label: settings.lineNumbers ? "Hide line numbers" : "Show line numbers",
          action: () => updateSettings({ lineNumbers: !settings.lineNumbers }),
        },
        {
          label: settings.spellcheck ? "Disable spellcheck" : "Enable spellcheck",
          action: () => updateSettings({ spellcheck: !settings.spellcheck }),
        },
      ],
    });
  };

  return (
    <div className={`note-view mode-${tab.mode}`}>
      <header className="note-header">
        <div className="note-header-left">
          <button
            className="icon-button"
            onClick={() => void navigateHistory(-1)}
            disabled={!canBack}
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => void navigateHistory(1)}
            disabled={!canForward}
            title="Forward"
            aria-label="Forward"
          >
            <ArrowRight size={16} />
          </button>
          <span className="note-header-separator" />
          <FileText size={14} className="note-header-file-icon" />
          <span className="note-header-title">{tab.title}</span>
          {folder && <span className="note-header-folder">· {folder}</span>}
        </div>
        <div className="note-header-actions">
          <button
            className={`icon-button ${rightPanelOpen && rightPanel === "outline" ? "active" : ""}`}
            onClick={() => toggleRightPanel("outline")}
            title="Outline"
            aria-label="Outline"
          >
            <ListTree size={16} />
          </button>
          <button
            className={`icon-button ${rightPanelOpen && rightPanel === "backlinks" ? "active" : ""}`}
            onClick={() => toggleRightPanel("backlinks")}
            title="Backlinks"
            aria-label="Backlinks"
          >
            <Link2 size={16} />
          </button>
          <button
            className={`icon-button ${readonly ? "active" : ""}`}
            onClick={() => void setMode(tab.id, readonly ? "edit" : "read")}
            title={readonly ? "Edit note (Ctrl+E)" : "Reading view (Ctrl+E)"}
            aria-label={readonly ? "Edit note" : "Reading view"}
          >
            {readonly ? <Pencil size={16} /> : <BookOpen size={16} />}
          </button>
          <button className="icon-button" onClick={openMore} title="More options" aria-label="More options">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </header>

      {!readonly && <EditorToolbar />}

      <div
        className={
          readonly
            ? `note-scroll reading`
            : "note-editor"
        }
      >
        <div className={`note-content ${settings.readableLineLength ? "readable" : "full-width"}`}>
          <InlineTitle tab={tab} />
          {readonly ? (
            <ReadingView tab={tab} />
          ) : (
            <Editor
              tab={tab}
              settings={settings}
              onChange={(content) => setTabContent(tab.id, content)}
              onCursor={setCursor}
              onOpenLink={(target) => void openLinkTarget(target, tab.path)}
              resolveImage={(reference) =>
                attachmentUrl(vault.path, tab.path!, reference, tree)
              }
              jumpRequest={jumpRequest}
            />
          )}
        </div>
      </div>
    </div>
  );
}
