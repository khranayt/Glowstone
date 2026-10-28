import type { EditorView } from "@codemirror/view";
import type { ChangeSpec } from "@codemirror/state";
import { redo, undo } from "@codemirror/commands";
import type { KeyBinding } from "@codemirror/view";

let activeView: EditorView | null = null;

export const setActiveEditor = (view: EditorView | null) => {
  activeView = view;
};

export const getActiveEditor = () => activeView;

export const focusEditorSoon = () => {
  window.setTimeout(() => activeView?.focus(), 0);
};

const withView = (fn: (view: EditorView) => void) => {
  const view = activeView;
  if (!view) return false;
  fn(view);
  view.focus();
  return true;
};

const wrapSelection = (before: string, after: string, placeholder: string) =>
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const content = selected || placeholder;
    const insertion = `${before}${content}${after}`;
    view.dispatch({
      changes: { from, to, insert: insertion },
      selection: {
        anchor: from + before.length,
        head: from + before.length + content.length,
      },
      scrollIntoView: true,
    });
  });

const insertText = (text: string, cursorOffset?: number, selectLength = 0) =>
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const body = text.replace("$SEL", selected);
    const anchor = from + (cursorOffset ?? body.length);
    view.dispatch({
      changes: { from, to, insert: body },
      selection: { anchor, head: anchor + selectLength },
      scrollIntoView: true,
    });
  });

const stripBlockPrefix = (text: string) =>
  text.replace(
    /^(\s*)(#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/,
    "",
  );

const applyBlockPrefix = (
  makePrefix: (index: number, text: string) => string,
  toggleTest?: (text: string) => boolean,
) =>
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const startLine = view.state.doc.lineAt(from);
    const endLine = view.state.doc.lineAt(to);
    const lines = [];
    for (let n = startLine.number; n <= endLine.number; n++) lines.push(view.state.doc.line(n));
    const toggle = toggleTest ? lines.every((line) => toggleTest(line.text)) : false;
    const changes: ChangeSpec[] = lines.map((line, index) => {
      const stripped = stripBlockPrefix(line.text);
      return {
        from: line.from,
        to: line.to,
        insert: toggle ? stripped : `${makePrefix(index, line.text)}${stripped}`,
      };
    });
    view.dispatch({ changes, scrollIntoView: true });
  });

const stripInline = (text: string) =>
  text
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/<\/?u>/g, "")
    .replace(/<span[^>]*>([\s\S]*?)<\/span>/g, "$1");

const clearFormatting = () =>
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    if (selected) {
      view.dispatch({
        changes: { from, to, insert: stripInline(selected) },
        selection: { anchor: from, head: from + stripInline(selected).length },
      });
      return;
    }
    const line = view.state.doc.lineAt(from);
    const cleaned = stripInline(stripBlockPrefix(line.text));
    view.dispatch({ changes: { from: line.from, to: line.to, insert: cleaned } });
  });

const heading = (level: number) =>
  applyBlockPrefix(
    () => `${"#".repeat(level)} `,
    (text) => new RegExp(`^#{${level}}\\s`).test(text),
  );

const bulletList = () =>
  applyBlockPrefix(() => "- ", (text) => /^[-*+]\s/.test(text));

const numberedList = () =>
  applyBlockPrefix((index) => `${index + 1}. `, (text) => /^\s*\d+[.)]\s/.test(text));

const taskList = () =>
  applyBlockPrefix(() => "- [ ] ", (text) => /^[-*+]\s+\[[ xX]\]\s/.test(text));

const quote = () => applyBlockPrefix(() => "> ", (text) => /^>\s?/.test(text));

const paragraph = () =>
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const start = view.state.doc.lineAt(from).number;
    const end = view.state.doc.lineAt(to).number;
    const changes: ChangeSpec[] = [];
    for (let number = start; number <= end; number += 1) {
      const line = view.state.doc.line(number);
      const stripped = stripBlockPrefix(line.text);
      if (stripped !== line.text) {
        changes.push({ from: line.from, to: line.to, insert: stripped });
      }
    }
    if (changes.length === 0) return;
    view.dispatch({ changes, scrollIntoView: true });
  });

const tableCell = (cell: string) => cell.replace(/\|/g, "\\|").trim();

const splitTableRow = (line: string): string[] => {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const char of text) {
    if (escaped) {
      cell += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map(tableCell);
};

const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);

export const insertTable = (rowCount: number, columnCount: number) =>
  withView((view) => {
    const rows = Math.max(1, Math.min(20, Math.round(rowCount)));
    const cols = Math.max(1, Math.min(12, Math.round(columnCount)));
    const header = `| ${Array.from({ length: cols }, (_, index) => `Column ${index + 1}`).join(" | ")} |`;
    const divider = `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`;
    const body = Array.from(
      { length: Math.max(0, rows - 1) },
      () => `| ${Array.from({ length: cols }, () => "").join(" | ")} |`,
    );
    const block = [header, divider, ...body].join("\n");
    const { from, to } = view.state.selection.main;
    const doc = view.state.doc;
    const before = from > 0 && doc.sliceString(from - 1, from) !== "\n" ? "\n" : "";
    const after = to < doc.length && doc.sliceString(to, to + 1) !== "\n" ? "\n" : "";
    const insertion = `${before}${block}${after}`;
    const cursor = from + before.length + 2;
    view.dispatch({
      changes: { from, to, insert: insertion },
      selection: { anchor: cursor },
      scrollIntoView: true,
    });
  });

/** Insert a standalone block (such as an image) on its own line. */
export const insertBlock = (block: string) =>
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const doc = view.state.doc;
    const before = from > 0 && doc.sliceString(from - 1, from) !== "\n" ? "\n" : "";
    // Live preview hides the active line's Markdown, so land the cursor on the
    // line after the block. Otherwise a freshly added image would show its raw
    // `![](...)` source until the user clicks elsewhere.
    const hasNewline = to < doc.length && doc.sliceString(to, to + 1) === "\n";
    const insertion = `${before}${block}${hasNewline ? "" : "\n"}`;
    view.dispatch({
      changes: { from, to, insert: insertion },
      selection: { anchor: from + before.length + block.length + 1 },
      scrollIntoView: true,
    });
  });

export const insertAttachment = (markdown: string) => insertBlock(markdown);

const formatTable = () =>
  withView((view) => {
    const doc = view.state.doc;
    const { from, to } = view.state.selection.main;
    const lineAt = (number: number) => doc.line(number).text;
    let first = doc.lineAt(from).number;
    let last = doc.lineAt(to).number;
    if (!isTableLine(lineAt(first)) || !isTableLine(lineAt(last))) return;
    while (first > 1 && isTableLine(lineAt(first - 1))) first -= 1;
    while (last < doc.lines && isTableLine(lineAt(last + 1))) last += 1;

    const rows = Array.from({ length: last - first + 1 }, (_, index) =>
      splitTableRow(lineAt(first + index)),
    );
    const widths: number[] = [];
    for (const row of rows) {
      row.forEach((cell, index) => {
        widths[index] = Math.max(widths[index] ?? 3, cell.length, 3);
      });
    }
    if (widths.length === 0) return;
    const delimiter = (row: string[]) =>
      row.every((cell) => /^:?-{3,}:?$/.test(cell)) || row.every((cell) => cell === "");
    const formatted = rows.map((row, index) => {
      if (index > 0 && delimiter(row)) {
        return `| ${widths.map((width) => "-".repeat(Math.max(3, width))).join(" | ")} |`;
      }
      const cells = widths.map((width, column) => (row[column] ?? "").padEnd(width, " "));
      return `| ${cells.join(" | ")} |`;
    });
    const insertion = formatted.join("\n");
    const firstLine = doc.line(first);
    const lastLine = doc.line(last);
    view.dispatch({
      changes: { from: firstLine.from, to: lastLine.to, insert: insertion },
      selection: { anchor: firstLine.from + 2 },
      scrollIntoView: true,
    });
  });

export type EditorCommandName =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "strike"
  | "underline"
  | "highlight"
  | "inlineCode"
  | "codeBlock"
  | "link"
  | "wikilink"
  | "heading1"
  | "heading2"
  | "heading3"
  | "paragraph"
  | "quote"
  | "bulletList"
  | "numberedList"
  | "taskList"
  | "table"
  | "formatTable"
  | "image"
  | "divider"
  | "callout"
  | "math"
  | "footnote"
  | "clear"
  | `color:${string}`;

export const runEditorCommand = (command: EditorCommandName): boolean => {
  if (command.startsWith("color:")) {
    const color = command.slice(6);
    return wrapSelection(`<span style="color: ${color}">`, "</span>", "text");
  }
  switch (command) {
    case "undo":
      return withView((view) => {
        undo(view);
      });
    case "redo":
      return withView((view) => {
        redo(view);
      });
    case "bold":
      return wrapSelection("**", "**", "bold text");
    case "italic":
      return wrapSelection("*", "*", "italic text");
    case "strike":
      return wrapSelection("~~", "~~", "strikethrough");
    case "underline":
      return wrapSelection("<u>", "</u>", "underlined text");
    case "highlight":
      return wrapSelection("==", "==", "highlighted text");
    case "inlineCode":
      return wrapSelection("`", "`", "code");
    case "codeBlock":
      return insertText("```\n$SEL\n```", 4);
    case "link":
      return withView((view) => {
        const { from, to } = view.state.selection.main;
        const selected = view.state.sliceDoc(from, to);
        const label = selected || "link text";
        const insertion = `[${label}]()`;
        const cursor = from + label.length + 2;
        view.dispatch({
          changes: { from, to, insert: insertion },
          selection: { anchor: cursor },
          scrollIntoView: true,
        });
      });
    case "wikilink":
      return wrapSelection("[[", "]]", "Note");
    case "heading1":
      return heading(1);
    case "heading2":
      return heading(2);
    case "heading3":
      return heading(3);
    case "paragraph":
      return paragraph();
    case "quote":
      return quote();
    case "bulletList":
      return bulletList();
    case "numberedList":
      return numberedList();
    case "taskList":
      return taskList();
    case "table":
      return insertText(
        "| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n",
        2,
        8,
      );
    case "formatTable":
      return formatTable();
    case "image":
      return insertText("![image](attachments/)", 2, 5);
    case "divider":
      return insertText("\n---\n", 5);
    case "callout":
      return insertText("> [!note] Title\n> ", 10, 5);
    case "math":
      return insertText("$$\n\n$$", 3);
    case "footnote":
      return insertText("[^1]\n\n[^1]: ", 12, 0);
    case "clear":
      return clearFormatting();
    default:
      return false;
  }
};

export const markdownKeymap: KeyBinding[] = [
  { key: "Mod-b", run: () => runEditorCommand("bold"), preventDefault: true },
  { key: "Mod-i", run: () => runEditorCommand("italic"), preventDefault: true },
  { key: "Mod-k", run: () => runEditorCommand("link"), preventDefault: true },
  { key: "Mod-Shift-x", run: () => runEditorCommand("strike"), preventDefault: true },
  { key: "Mod-Shift-h", run: () => runEditorCommand("highlight"), preventDefault: true },
  { key: "Mod-`", run: () => runEditorCommand("inlineCode"), preventDefault: true },
];
