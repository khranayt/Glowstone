import { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import type { Tab, Settings } from "../types";
import { glowstoneEditorTheme, markdownHighlighting } from "./theme";
import { livePreview } from "./livePreview";
import { insertAttachment, markdownKeymap, setActiveEditor } from "./commands";
import { useAppStore } from "../store";
import { api } from "../lib/api";
import {
  attachmentFolderFor,
  attachmentMarkdown,
  attachmentNameFor,
  fileToBase64,
} from "../lib/attachments";

interface EditorProps {
  tab: Tab;
  settings: Settings;
  onChange: (content: string) => void;
  onCursor: (cursor: { line: number; col: number }) => void;
  onOpenLink: (target: string) => void;
  resolveImage: (reference: string) => Promise<string | null>;
  jumpRequest: { tabId: string; line: number; nonce: number } | null;
}

export function Editor({
  tab,
  settings,
  onChange,
  onCursor,
  onOpenLink,
  resolveImage,
  jumpRequest,
}: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const stateCache = useRef(new Map<string, EditorState>());
  const scrollCache = useRef(new Map<string, number>());
  const currentKey = useRef<string | null>(null);
  const lineNumbersCompartment = useRef(new Compartment());
  const spellcheckCompartment = useRef(new Compartment());
  const propsRef = useRef({ onChange, onCursor, onOpenLink, resolveImage, settings });
  propsRef.current = { onChange, onCursor, onOpenLink, resolveImage, settings };

  const tabKey = `${tab.id}:${tab.path ?? ""}`;

  const applySettings = (view: EditorView) => {
    const current = propsRef.current.settings;
    view.dispatch({
      effects: [
        lineNumbersCompartment.current.reconfigure(
          current.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
        ),
        spellcheckCompartment.current.reconfigure(
          EditorView.contentAttributes.of({
            spellcheck: current.spellcheck ? "true" : "false",
            autocorrect: "off",
            autocapitalize: "off",
          }),
        ),
      ],
    });
  };

  const importImages = async (files: File[]) => {
    const state = useAppStore.getState();
    if (!state.vault) return;
    const active = state.tabs.find((item) => item.id === state.activeTabId);
    if (!active || active.kind !== "note" || !active.path) {
      state.toast("Open a note before adding an image", "error");
      return;
    }
    const folder = attachmentFolderFor(state.vault.path, active.path, state.settings);
    for (const file of files) {
      try {
        const data = await fileToBase64(file);
        const name = attachmentNameFor(file);
        const saved = await api.saveAttachment(
          state.vault.path,
          folder,
          name,
          data,
        );
        insertAttachment(attachmentMarkdown(state.vault.path, active.path, saved, name));
        state.expandToPath(saved);
      } catch (error) {
        state.toast(`Could not add image: ${String(error)}`, "error");
      }
    }
    await state.refreshTree();
  };

  const createState = (content: string) => {
    const current = propsRef.current.settings;
    return EditorState.create({
      doc: content,
      extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        markdownHighlighting,
        glowstoneEditorTheme,
        bracketMatching(),
        indentOnInput(),
        highlightSelectionMatches(),
        placeholder("Start writing…"),
        lineNumbersCompartment.current.of(
          current.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
        ),
        spellcheckCompartment.current.of(
          EditorView.contentAttributes.of({
            spellcheck: current.spellcheck ? "true" : "false",
            autocorrect: "off",
            autocapitalize: "off",
          }),
        ),
        livePreview(() => ({
          resolveImage: (reference) => propsRef.current.resolveImage(reference),
        })),
        EditorView.domEventHandlers({
          paste: (event) => {
            const files = Array.from(event.clipboardData?.files ?? []).filter(
              (file) => file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file.name),
            );
            if (files.length === 0) return false;
            event.preventDefault();
            void importImages(files);
            return true;
          },
          drop: (event) => {
            const files = Array.from(event.dataTransfer?.files ?? []).filter(
              (file) => file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file.name),
            );
            if (files.length === 0) return false;
            event.preventDefault();
            void importImages(files);
            return true;
          },
          mousedown: (event, view) => {
            if (!(event.ctrlKey || event.metaKey)) return false;
            const target = event.target as HTMLElement | null;
            const link = target?.closest<HTMLElement>("[data-href]");
            if (link?.dataset.href) {
              event.preventDefault();
              propsRef.current.onOpenLink(link.dataset.href);
              view.focus();
              return true;
            }
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            propsRef.current.onChange(update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            propsRef.current.onCursor({ line: line.number, col: head - line.from + 1 });
          }
        }),
        keymap.of([
          ...markdownKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
      ],
    });
  };

  const scrollToLine = (view: EditorView, lineNumber: number) => {
    const line = view.state.doc.line(
      Math.max(1, Math.min(lineNumber, view.state.doc.lines)),
    );
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
    const head = line.from;
    const currentLine = view.state.doc.lineAt(head);
    propsRef.current.onCursor({ line: currentLine.number, col: head - currentLine.from + 1 });
  };

  // Create the view once.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({ doc: "" }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    setActiveEditor(view);
    return () => {
      setActiveEditor(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Swap document states when the active note changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const previous = currentKey.current;
    if (previous) {
      stateCache.current.set(previous, view.state);
      scrollCache.current.set(previous, view.scrollDOM.scrollTop);
    }
    if (previous === tabKey) return;
    let state = stateCache.current.get(tabKey);
    if (!state) {
      state = createState(tab.content);
      stateCache.current.set(tabKey, state);
    }
    view.setState(state);
    currentKey.current = tabKey;
    setActiveEditor(view);
    applySettings(view);
    requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = scrollCache.current.get(tabKey) ?? 0;
      if (tab.pendingLine != null) {
        scrollToLine(view, tab.pendingLine);
      } else {
        const head = view.state.selection.main.head;
        const line = view.state.doc.lineAt(head);
        propsRef.current.onCursor({ line: line.number, col: head - line.from + 1 });
      }
      view.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  // External content updates (disk reload, read-mode task toggles, etc.).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || currentKey.current !== tabKey) return;
    const current = view.state.doc.toString();
    if (current === tab.content) return;
    const anchor = Math.min(view.state.selection.main.anchor, tab.content.length);
    view.dispatch({
      changes: { from: 0, to: current.length, insert: tab.content },
      selection: { anchor },
    });
    stateCache.current.set(tabKey, view.state);
  }, [tab.content, tabKey]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) applySettings(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.lineNumbers, settings.spellcheck]);

  useEffect(() => {
    if (!jumpRequest || jumpRequest.tabId !== tab.id) return;
    const view = viewRef.current;
    if (!view) return;
    scrollToLine(view, jumpRequest.line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpRequest, tab.id]);

  return (
    <div
      className="editor-host"
      ref={hostRef}
      style={{ ["--editor-font-size" as string]: `${settings.fontSize}px` }}
    />
  );
}
