import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const glowstoneEditorTheme = EditorView.theme({
  "&": {
    color: "var(--text-normal)",
    backgroundColor: "transparent",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-text)",
    fontSize: "var(--editor-font-size, 16px)",
    lineHeight: "1.75",
    overflow: "auto",
    padding: "0",
  },
  ".cm-content": {
    padding: "6px 0 40vh",
    caretColor: "var(--interactive-accent)",
    color: "var(--text-normal)",
  },
  ".cm-line": {
    padding: "0 4px",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--text-faint)",
    paddingRight: "6px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 4px 0 8px",
    fontSize: "12px",
    minWidth: "26px",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--text-muted)",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--interactive-accent)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--text-selection) !important",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--text-selection-match)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--text-highlight)",
    outline: "1px solid var(--interactive-accent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
  },
  ".cm-panels": {
    backgroundColor: "var(--background-secondary)",
    color: "var(--text-normal)",
    borderColor: "var(--background-modifier-border)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--background-modifier-border)",
  },
  ".cm-textfield": {
    backgroundColor: "var(--background-primary)",
    border: "1px solid var(--background-modifier-border)",
    color: "var(--text-normal)",
    borderRadius: "4px",
    padding: "3px 6px",
    outline: "none",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--interactive-normal)",
    border: "1px solid var(--background-modifier-border)",
    color: "var(--text-normal)",
    borderRadius: "4px",
    padding: "3px 9px",
  },
  ".cm-placeholder": {
    color: "var(--text-faint)",
    fontStyle: "normal",
  },
});

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, class: "cm-syntax-heading" },
  { tag: tags.strong, class: "cm-syntax-strong" },
  { tag: tags.emphasis, class: "cm-syntax-emphasis" },
  { tag: tags.strikethrough, class: "cm-syntax-strike" },
  { tag: tags.link, class: "cm-syntax-link" },
  { tag: tags.url, class: "cm-syntax-url" },
  { tag: tags.monospace, class: "cm-syntax-code" },
  { tag: tags.quote, class: "cm-syntax-quote" },
  { tag: tags.list, class: "cm-syntax-meta" },
  { tag: tags.meta, class: "cm-syntax-meta" },
  { tag: tags.processingInstruction, class: "cm-syntax-meta" },
  { tag: tags.contentSeparator, class: "cm-syntax-hr" },
  { tag: tags.escape, class: "cm-syntax-meta" },
  { tag: tags.keyword, class: "cm-hl-keyword" },
  { tag: tags.string, class: "cm-hl-string" },
  { tag: tags.comment, class: "cm-hl-comment" },
  { tag: tags.number, class: "cm-hl-number" },
  { tag: tags.bool, class: "cm-hl-atom" },
  { tag: tags.atom, class: "cm-hl-atom" },
  { tag: tags.function(tags.variableName), class: "cm-hl-function" },
  { tag: tags.typeName, class: "cm-hl-type" },
  { tag: tags.tagName, class: "cm-hl-tag" },
  { tag: tags.attributeName, class: "cm-hl-attribute" },
]);

export const markdownHighlighting = syntaxHighlighting(highlightStyle);
