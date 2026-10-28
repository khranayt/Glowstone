import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { StateField, type EditorState, type Range } from "@codemirror/state";
import { calloutKind, calloutSvg } from "../lib/calloutIcons";
import { splitReferenceSize } from "../lib/attachments";

export interface LivePreviewOptions {
  resolveImage: (reference: string) => Promise<string | null>;
}

type DecoRange = Range<Decoration>;

const headingLine = [1, 2, 3, 4, 5, 6].map((level) =>
  Decoration.line({ class: `cm-heading-line cm-heading-${level}` }),
);
const quoteLine = Decoration.line({ class: "cm-quote-line" });
const codeLine = Decoration.line({ class: "cm-code-line" });
const listLine = Decoration.line({ class: "cm-list-line" });
const taskLine = Decoration.line({ class: "cm-list-line cm-task-line" });

const hidden = Decoration.replace({});

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-task-checkbox";
    box.checked = this.checked;
    box.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: { from: this.from, to: this.from + 3, insert: this.checked ? "[ ]" : "[x]" },
      });
      // Keep the checkbox in place: focusing the editor makes the line "active"
      // and used to swap the widget back to raw Markdown, nudging the row down.
    });
    return box;
  }

  ignoreEvent() {
    return true;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly reference: string,
    readonly alt: string,
    readonly resolve: (reference: string) => Promise<string | null>,
    readonly width?: number,
    readonly height?: number,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return (
      other.reference === this.reference &&
      other.width === this.width &&
      other.height === this.height
    );
  }

  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-image-widget";
    const image = document.createElement("img");
    image.alt = this.alt || this.reference;
    image.draggable = false;
    if (this.width) image.style.width = `${this.width}px`;
    if (this.height) image.style.height = `${this.height}px`;
    wrap.append(image);
    void this.resolve(this.reference).then((url) => {
      if (url) image.src = url;
      else {
        wrap.classList.add("cm-image-widget-error");
        wrap.textContent = this.alt || this.reference;
      }
    });
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

class RuleWidget extends WidgetType {
  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-hr-widget";
    return rule;
  }

  ignoreEvent() {
    return true;
  }
}

class BulletWidget extends WidgetType {
  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-list-bullet";
    return dot;
  }

  ignoreEvent() {
    return true;
  }
}

const splitTableCells = (line: string): string[] => {
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
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
};

const isTableText = (text: string) => /^\s*\|.*\|\s*$/.test(text);

/** Parse a line that contains only an image (Markdown or wiki syntax). */
const parseStandaloneImage = (
  text: string,
): { reference: string; alt: string } | null => {
  const value = text.trim();
  if (!value.startsWith("!")) return null;

  if (value.startsWith("![[")) {
    const match = /^!\[\[([^\]\n]+?)\]\]$/.exec(value);
    return match ? { reference: match[1], alt: "" } : null;
  }

  const head = /^!\[([^\]\n]*)\]\(/.exec(value);
  if (!head) return null;

  let index = head[0].length;
  let reference = "";
  if (value[index] === "<") {
    const close = value.indexOf(">", index + 1);
    if (close < 0) return null;
    reference = value.slice(index + 1, close);
    index = close + 1;
  } else {
    let depth = 0;
    const start = index;
    for (; index < value.length; index += 1) {
      const char = value[index];
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === "(") depth += 1;
      else if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
    }
    if (index >= value.length) return null;
    reference = value.slice(start, index);
  }

  const rest = value.slice(index).trim();
  if (rest.startsWith(")")) {
    if (rest.slice(1).trim()) return null;
  } else if (!/^(?:"[^"]*"|'[^']*')\s*\)\s*$/.test(rest)) {
    return null;
  }

  const quoted = /^(.*?)(?:\s+"([^"]*)"|\s+'([^']*)')$/s.exec(reference);
  return {
    reference: (quoted ? quoted[1] : reference).trim(),
    alt: head[1],
  };
};

const isDelimiterRow = (cells: string[]) =>
  cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));

type CellAlign = "" | "left" | "center" | "right";

const alignmentOf = (cell: string): CellAlign => {
  const value = cell.trim();
  const left = value.startsWith(":");
  const right = value.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
};

class TableWidget extends WidgetType {
  constructor(
    readonly rows: string[][],
    readonly align: CellAlign[],
    readonly from: number,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return other.from === this.from && other.rows === this.rows;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-table-widget";
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const body = document.createElement("tbody");
    const cellFor = (tag: "th" | "td", value: string, column: number) => {
      const cell = document.createElement(tag);
      cell.textContent = value;
      const align = this.align[column];
      if (align) cell.style.textAlign = align;
      return cell;
    };
    this.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.forEach((value, column) => {
        tr.append(cellFor(rowIndex === 0 ? "th" : "td", value, column));
      });
      (rowIndex === 0 ? head : body).append(tr);
    });
    table.append(head, body);
    wrap.append(table);
    wrap.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

class CodeLangWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }

  eq(other: CodeLangWidget) {
    return other.lang === this.lang;
  }

  toDOM() {
    const label = document.createElement("span");
    label.className = "cm-code-lang";
    label.textContent = this.lang || "text";
    return label;
  }

  ignoreEvent() {
    return true;
  }
}

class CalloutIconWidget extends WidgetType {
  constructor(readonly type: string) {
    super();
  }

  eq(other: CalloutIconWidget) {
    return other.type === this.type;
  }

  toDOM() {
    const icon = document.createElement("span");
    icon.className = `cm-callout-icon cm-callout-icon-${calloutKind(this.type)}`;
    icon.innerHTML = calloutSvg(this.type, 13);
    return icon;
  }

  ignoreEvent() {
    return true;
  }
}

interface InlinePiece {
  range: [number, number];
  content: [number, number];
  className: string;
  attrs?: Record<string, string>;
  hide: [number, number][];
}

const isActiveLine = (view: EditorView, position: number, end: number) => {
  return view.state.selection.ranges.some(
    (range) => range.from <= end && range.to >= position,
  );
};

const overlap = (a: [number, number], b: [number, number]) => a[0] < b[1] && a[1] > b[0];

const inlinePiece = (
  base: number,
  match: RegExpExecArray,
  className: string,
  contentStart: number,
  contentEnd: number,
  attrs?: Record<string, string>,
): InlinePiece | null => {
  if (contentEnd <= contentStart) return null;
  const fullStart = base + match.index;
  const fullEnd = fullStart + match[0].length;
  return {
    range: [fullStart, fullEnd],
    content: [base + contentStart, base + contentEnd],
    className,
    attrs,
    hide: [
      [fullStart, base + contentStart],
      [base + contentEnd, fullEnd],
    ],
  };
};

interface TableBlock {
  startLine: number;
  endLine: number;
  from: number;
  to: number;
  rows: string[][];
  align: CellAlign[];
}

const findTableBlocks = (state: EditorState): TableBlock[] => {
  const doc = state.doc;
  const blocks: TableBlock[] = [];
  for (let n = 1; n < doc.lines; n += 1) {
    if (!isTableText(doc.line(n).text)) continue;
    const headerCells = splitTableCells(doc.line(n).text);
    const dividerCells = splitTableCells(doc.line(n + 1).text);
    if (headerCells.length === 0 || !isDelimiterRow(dividerCells)) continue;
    let end = n + 1;
    while (end < doc.lines && isTableText(doc.line(end + 1).text)) end += 1;
    const rows: string[][] = [];
    for (let index = n; index <= end; index += 1) {
      if (index === n + 1) continue;
      rows.push(splitTableCells(doc.line(index).text));
    }
    blocks.push({
      startLine: n,
      endLine: end,
      from: doc.line(n).from,
      to: doc.line(end).to,
      rows,
      align: dividerCells.map(alignmentOf),
    });
    n = end;
  }
  return blocks;
};

const build = (view: EditorView, options: LivePreviewOptions): DecorationSet => {
  const { state } = view;
  const ranges: DecoRange[] = [];
  const doc = state.doc;

  const fenceLines = new Set<number>();
  const fenceMeta = new Map<number, { opening: boolean; lang: string }>();
  let inFence = false;
  let fenceChar = "";
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    const match = /^\s*(```+|~~~+)\s*([^\s`]*)/.exec(text);
    if (!inFence && match) {
      inFence = true;
      fenceChar = match[1][0];
      fenceLines.add(n);
      fenceMeta.set(n, { opening: true, lang: match[2] ?? "" });
    } else if (inFence && match && match[1][0] === fenceChar) {
      fenceLines.add(n);
      fenceMeta.set(n, { opening: false, lang: "" });
      inFence = false;
    } else if (inFence) {
      fenceLines.add(n);
    }
  }

  // Map callout markers to the quote lines they cover.
  const callouts = new Map<number, { type: string; first: boolean; last: boolean }>();
  let calloutType: string | null = null;
  let lastCalloutLine = 0;
  const closeCallout = () => {
    if (lastCalloutLine) callouts.get(lastCalloutLine)!.last = true;
    lastCalloutLine = 0;
  };
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    if (!/^\s*>[ \t]?/.test(text)) {
      closeCallout();
      calloutType = null;
      continue;
    }
    const header = /^\s*>\s*\[!([A-Za-z-]+)\][+-]?/.exec(text);
    if (header) {
      calloutType = header[1].toLowerCase();
      callouts.set(n, { type: calloutType, first: true, last: false });
      lastCalloutLine = n;
    } else if (calloutType) {
      callouts.set(n, { type: calloutType, first: false, last: false });
      lastCalloutLine = n;
    }
  }
  closeCallout();

  // Table lines are handled by the block-table state field; skip them here so
  // the plugin only provides inline decorations.
  const tableLineSet = new Set<number>();
  for (const block of findTableBlocks(state)) {
    for (let index = block.startLine; index <= block.endLine; index += 1) {
      tableLineSet.add(index);
    }
  }

  for (const visible of view.visibleRanges) {
    let position = visible.from;
    while (position <= visible.to) {
      const line = doc.lineAt(position);
      const text = line.text;
      const active = isActiveLine(view, line.from, line.to);

      if (fenceLines.has(line.number)) {
        const fence = fenceMeta.get(line.number);
        if (fence) {
          ranges.push(
            Decoration.line({
              class: `cm-code-line cm-code-fence ${fence.opening ? "cm-code-start" : "cm-code-end"}`,
            }).range(line.from),
          );
          if (!active) {
            ranges.push(
              (fence.opening
                ? Decoration.replace({ widget: new CodeLangWidget(fence.lang) })
                : hidden
              ).range(line.from, line.to),
            );
          }
        } else {
          ranges.push(codeLine.range(line.from));
        }
        position = line.to + 1;
        continue;
      }

      // Table rows are rendered by the table state field below.
      if (tableLineSet.has(line.number)) {
        position = line.to + 1;
        continue;
      }

      const headingMatch = /^(#{1,6})([ \t]+)/.exec(text);
      if (headingMatch) {
        ranges.push(headingLine[headingMatch[1].length - 1].range(line.from));
        if (!active) {
          ranges.push(hidden.range(line.from, line.from + headingMatch[0].length));
        }
      }

      const quoteMatch = /^(\s*(?:>[ \t]?)+)/.exec(text);
      const callout = callouts.get(line.number);
      if (quoteMatch && quoteMatch[0].trim()) {
        ranges.push(quoteLine.range(line.from));
        if (callout) {
          ranges.push(
            Decoration.line({
              class: `cm-callout-line cm-callout-${calloutKind(callout.type)}${
                callout.first ? " cm-callout-first" : ""
              }${callout.last ? " cm-callout-last" : ""}`,
            }).range(line.from),
          );
        }
        if (!active) {
          ranges.push(hidden.range(line.from, line.from + quoteMatch[0].length));
          if (callout?.first) {
            const marker = /^\[!([A-Za-z-]+)\][+-]?/.exec(text.slice(quoteMatch[0].length));
            if (marker) {
              const start = line.from + quoteMatch[0].length;
              ranges.push(
                Decoration.replace({ widget: new CalloutIconWidget(callout.type) }).range(
                  start,
                  start + marker[0].length,
                ),
              );
            }
          }
        }
      }

      const taskMatch = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](\s+)/.exec(text);
      const bulletMatch = /^(\s*)([-*+])(\s+)/.exec(text);
      const orderedMatch = /^(\s*)(\d+[.)])(\s+)/.exec(text);
      if (taskMatch) {
        ranges.push(taskLine.range(line.from));
        const indent = /^\s*/.exec(text)?.[0].length ?? 0;
        const markerStart = line.from + indent;
        const markerEnd = line.from + taskMatch[0].length;
        const markerActive = view.state.selection.ranges.some(
          (range) => range.from <= markerEnd && range.to >= markerStart,
        );
        // Keep the checkbox rendered on the focused line too, unless the cursor
        // is actually inside the marker, so clicking never shifts the row.
        if (!active || !markerActive) {
          const boxStart = line.from + taskMatch[1].length;
          ranges.push(
            Decoration.replace({
              widget: new CheckboxWidget(taskMatch[2].toLowerCase() === "x", boxStart),
            }).range(markerStart, markerEnd),
          );
        }
      } else if (bulletMatch) {
        ranges.push(listLine.range(line.from));
        if (!active) {
          const markerPos = line.from + bulletMatch[1].length;
          ranges.push(
            Decoration.replace({ widget: new BulletWidget() }).range(markerPos, markerPos + 1),
          );
        }
      } else if (orderedMatch) {
        ranges.push(listLine.range(line.from));
      }

      // Standalone images (optionally inside a list item or quote) render as
      // actual images. The list marker and quote chrome stay intact.
      const imagePrefix =
        /^(\s*(?:(?:>[ \t]?)+)?(?:(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?)/.exec(text)?.[1] ?? "";
      const image = parseStandaloneImage(text.slice(imagePrefix.length));
      if (image && !active) {
        const { reference, width, height } = splitReferenceSize(image.reference);
        const alt = image.alt || reference;
        ranges.push(
          Decoration.replace({
            widget: new ImageWidget(reference, alt, options.resolveImage, width, height),
          }).range(line.from + imagePrefix.length, line.to),
        );
        position = line.to + 1;
        continue;
      }

      if (/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(text)) {
        if (!active) {
          ranges.push(
            Decoration.replace({ widget: new RuleWidget() }).range(line.from, line.to),
          );
          position = line.to + 1;
          continue;
        }
      }

      const pieces: InlinePiece[] = [];
      const accepted: [number, number][] = [];
      const base = line.from;

      const collect = (
        regex: RegExp,
        mapper: (match: RegExpExecArray) => InlinePiece | null,
      ) => {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text))) {
          if (match[0].length === 0) {
            regex.lastIndex += 1;
            continue;
          }
          const piece = mapper(match);
          if (!piece) continue;
          if (accepted.some((range) => overlap(range, piece.range))) continue;
          accepted.push(piece.range);
          pieces.push(piece);
        }
      };

      // Inline code has priority over every other inline syntax.
      collect(/`([^`\n]+)`/g, (match) =>
        inlinePiece(
          base,
          match,
          "cm-inline-code",
          match.index + 1,
          match.index + match[0].length - 1,
        ),
      );

      // Wiki links and embeds.
      collect(/!?\[\[([^\]\[\n`]+?)\]\]/g, (match) => {
        const raw = match[1];
        const pipe = raw.indexOf("|");
        const target = (pipe >= 0 ? raw.slice(0, pipe) : raw).trim();
        const label = pipe >= 0 ? raw.slice(pipe + 1).trim() : target;
        const isImage = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(target);
        if (!label) return null;
        const contentStart = pipe >= 0 ? match.index + 2 + pipe + 1 : match.index + 2;
        return inlinePiece(
          base,
          match,
          isImage ? "cm-wikilink cm-embed" : "cm-wikilink",
          contentStart,
          contentStart + label.length,
          isImage ? { "data-embed": target } : { "data-href": target },
        );
      });

      // Media / attachments referenced with markdown image syntax.
      collect(/!\[([^\]\n]*)\]\(\s*(?:<([^>\n]+)>|([^)\n]+?))(?:\s+["'][^"']*["'])?\s*\)/g, (match) => {
        if (!match[1]) return null;
        return inlinePiece(
          base,
          match,
          "cm-embed",
          match.index + 2,
          match.index + 2 + match[1].length,
          { "data-embed": match[2] ?? match[3] ?? "" },
        );
      });

      // Markdown links.
      collect(/\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match) => {
        if (!match[1]) return null;
        return inlinePiece(
          base,
          match,
          "cm-md-link",
          match.index + 1,
          match.index + 1 + match[1].length,
          { "data-href": match[2] },
        );
      });

      // Underline and inline text colour (produced by the toolbar).
      collect(/<u>([^<\n]+?)<\/u>/gi, (match) =>
        inlinePiece(base, match, "cm-underline", match.index + 3, match.index + match[0].length - 4),
      );
      collect(/<span\s+style="color:\s*([^";]+)"\s*>([^<\n]*?)<\/span>/gi, (match) => {
        const contentStart = match.index + match[0].indexOf(">") + 1;
        const contentEnd = match.index + match[0].lastIndexOf("</span>");
        return inlinePiece(
          base,
          match,
          "cm-text-color",
          contentStart,
          contentEnd,
          { style: `color: ${match[1].trim()}` },
        );
      });

      // Bold, strikethrough, highlight, then italics.
      collect(/\*\*\*([^*\n]+?)\*\*\*/g, (match) =>
        inlinePiece(
          base,
          match,
          "cm-strong cm-emphasis",
          match.index + 3,
          match.index + match[0].length - 3,
        ),
      );
      collect(/___([^_\n]+?)___/g, (match) =>
        inlinePiece(
          base,
          match,
          "cm-strong cm-emphasis",
          match.index + 3,
          match.index + match[0].length - 3,
        ),
      );
      collect(/\*\*([^*\n]+?)\*\*/g, (match) =>
        inlinePiece(base, match, "cm-strong", match.index + 2, match.index + match[0].length - 2),
      );
      collect(/__([^_\n]+?)__/g, (match) =>
        inlinePiece(base, match, "cm-strong", match.index + 2, match.index + match[0].length - 2),
      );
      collect(/~~([^~\n]+?)~~/g, (match) =>
        inlinePiece(base, match, "cm-strike", match.index + 2, match.index + match[0].length - 2),
      );
      collect(/==([^=\n]+?)==/g, (match) =>
        inlinePiece(base, match, "cm-highlight", match.index + 2, match.index + match[0].length - 2),
      );
      collect(/(?<![*\w])\*([^*\n]+?)\*(?![*\w])/g, (match) =>
        inlinePiece(base, match, "cm-emphasis", match.index + 1, match.index + match[0].length - 1),
      );
      collect(/(?<![_\w])_([^_\n]+?)_(?![_\w])/g, (match) =>
        inlinePiece(base, match, "cm-emphasis", match.index + 1, match.index + match[0].length - 1),
      );

      // URLs and tags.
      collect(/https?:\/\/[^\s<>()]+/g, (match) => {
        const start = match.index;
        return {
          range: [base + start, base + start + match[0].length],
          content: [base + start, base + start + match[0].length],
          className: "cm-url",
          attrs: { "data-href": match[0] },
          hide: [],
        };
      });
      collect(/(^|[\s(])#([A-Za-z0-9_/-]*[A-Za-z][A-Za-z0-9_/-]*)/g, (match) => {
        const prefixLength = match[1].length;
        const start = match.index + prefixLength;
        return {
          range: [base + start, base + start + match[0].length - prefixLength],
          content: [base + start, base + start + match[0].length - prefixLength],
          className: "cm-tag",
          attrs: { "data-tag": match[2] },
          hide: [],
        };
      });

      for (const piece of pieces) {
        const [from, to] = piece.content;
        if (to <= from) continue;
        const mark = Decoration.mark({
          class: piece.className,
          attributes: piece.attrs ?? {},
        });
        ranges.push(mark.range(from, to));
        if (!active) {
          for (const [hideFrom, hideTo] of piece.hide) {
            if (hideTo > hideFrom) ranges.push(hidden.range(hideFrom, hideTo));
          }
        }
      }

      position = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
};

const tableDecorations = (state: EditorState): DecorationSet => {
  const ranges = findTableBlocks(state)
    .filter(
      (block) =>
        !state.selection.ranges.some(
          (range) => range.from <= block.to && range.to >= block.from,
        ),
    )
    .map((block) =>
      Decoration.replace({
        widget: new TableWidget(block.rows, block.align, block.from),
        block: true,
      }).range(block.from, block.to),
    );
  return Decoration.set(ranges, true);
};

// Block widgets must come from a state field, not from a ViewPlugin.
const tableField = StateField.define<DecorationSet>({
  create: tableDecorations,
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.selection) return value;
    return tableDecorations(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const livePreview = (getOptions: () => LivePreviewOptions) => [
  tableField,
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, getOptions());
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = build(update.view, getOptions());
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  ),
];
