import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { calloutKind, calloutSvg } from "../lib/calloutIcons";

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
const activeTaskLine = Decoration.line({ class: "cm-list-line cm-task-line cm-task-line-active" });

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
      view.focus();
    });
    return box;
  }

  ignoreEvent() {
    return false;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly reference: string,
    readonly alt: string,
    readonly resolve: (reference: string) => Promise<string | null>,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.reference === this.reference;
  }

  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-image-widget";
    const image = document.createElement("img");
    image.alt = this.alt || this.reference;
    image.draggable = false;
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

      // Standalone images are rendered as actual images.
      const imageMatch = /^\s*(?:(!\[\[([^\]\n]+?)\]\]|!\[([^\]]*)\]\(([^)\n]+)\)))\s*$/.exec(text);
      if (imageMatch) {
        const reference = imageMatch[2] ?? imageMatch[4] ?? "";
        const alt = imageMatch[3] || reference;
        if (!active) {
          ranges.push(
            Decoration.replace({
              widget: new ImageWidget(reference, alt, options.resolveImage),
            }).range(line.from, line.to),
          );
          position = line.to + 1;
          continue;
        }
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
        ranges.push((active ? activeTaskLine : taskLine).range(line.from));
        if (!active) {
          const indent = /^\s*/.exec(text)?.[0].length ?? 0;
          const boxStart = line.from + taskMatch[1].length;
          ranges.push(
            Decoration.replace({
              widget: new CheckboxWidget(taskMatch[2].toLowerCase() === "x", boxStart),
            }).range(line.from + indent, line.from + taskMatch[0].length),
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
      collect(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (match) => {
        if (!match[1]) return null;
        return inlinePiece(
          base,
          match,
          "cm-embed",
          match.index + 2,
          match.index + 2 + match[1].length,
          { "data-embed": match[2] },
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

export const livePreview = (getOptions: () => LivePreviewOptions) =>
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
  );
