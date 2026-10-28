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
import { useT } from "../lib/useT";

function InlineTitle({ tab }: { tab: Tab }) {
  const t = useT();
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
      aria-label={t("Note title")}
      placeholder={t("Untitled")}
    />
  );
}

export function NoteView({ tab }: { tab: Tab }) {
  const t = useT();
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
          label: t("Rename note"),
          action: () =>
            setPrompt({
              title: t("Rename note"),
              label: t("Note name"),
              initial: tab.title,
              confirmLabel: t("Rename"),
              onSubmit: (value) => useAppStore.getState().commitInlineTitle(value),
            }),
        },
        { label: t("Delete note"), action: () => deletePath(tab.path!), danger: true },
        { label: "", separator: true },
        { label: t("Copy note path"), action: () => void navigator.clipboard.writeText(tab.path!) },
        {
          label: t("Reveal note in file manager"),
          action: () => {
            if (!isTauri()) return;
            void revealItemInDir(tab.path!).catch((error) => toast(String(error), "error"));
          },
        },
        { label: "", separator: true },
        {
          label: settings.lineNumbers ? t("Hide line numbers") : t("Show line numbers"),
          action: () => updateSettings({ lineNumbers: !settings.lineNumbers }),
        },
        {
          label: settings.spellcheck ? t("Disable spellcheck") : t("Enable spellcheck"),
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
            title={t("Back")}
            aria-label={t("Back")}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => void navigateHistory(1)}
            disabled={!canForward}
            title={t("Forward")}
            aria-label={t("Forward")}
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
            title={t("Outline")}
            aria-label={t("Outline")}
          >
            <ListTree size={16} />
          </button>
          <button
            className={`icon-button ${rightPanelOpen && rightPanel === "backlinks" ? "active" : ""}`}
            onClick={() => toggleRightPanel("backlinks")}
            title={t("Backlinks")}
            aria-label={t("Backlinks")}
          >
            <Link2 size={16} />
          </button>
          <button
            className={`icon-button ${readonly ? "active" : ""}`}
            onClick={() => void setMode(tab.id, readonly ? "edit" : "read")}
            title={readonly ? `${t("Edit note")} (Ctrl+E)` : `${t("Reading view")} (Ctrl+E)`}
            aria-label={readonly ? t("Edit note") : t("Reading view")}
          >
            {readonly ? <Pencil size={16} /> : <BookOpen size={16} />}
          </button>
          <button className="icon-button" onClick={openMore} title={t("More options")} aria-label={t("More options")}>
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
