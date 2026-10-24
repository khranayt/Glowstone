import { useEffect, useMemo, useRef } from "react";
import { decorateMarkdown, renderMarkdown } from "../lib/markdown";
import { useAppStore } from "../store";
import type { Tab } from "../types";
import { extractHeadings } from "../lib/utils";

export function ReadingView({ tab }: { tab: Tab }) {
  const vault = useAppStore((s) => s.vault);
  const tree = useAppStore((s) => s.tree);
  const openLinkTarget = useAppStore((s) => s.openLinkTarget);
  const setTabContent = useAppStore((s) => s.setTabContent);
  const jumpRequest = useAppStore((s) => s.jumpRequest);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const html = useMemo(() => renderMarkdown(tab.content), [tab.content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !vault || !tab.path) return;
    const scrollParent = container.closest<HTMLElement>(".note-scroll");
    const scrollTop = scrollParent?.scrollTop ?? 0;
    container.innerHTML = html;
    decorateMarkdown(container, {
      vaultRoot: vault.path,
      notePath: tab.path,
      tree,
      onOpenNote: (target) => void openLinkTarget(target, tab.path),
    });

    // Make rendered task checkboxes interactive.
    const taskLines: number[] = [];
    tab.content.split("\n").forEach((line, index) => {
      if (/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line)) taskLines.push(index);
    });
    const checkboxes = container.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    checkboxes.forEach((checkbox, index) => {
      const lineIndex = taskLines[index];
      if (lineIndex === undefined) {
        checkbox.disabled = true;
        return;
      }
      checkbox.disabled = false;
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
        const lines = tab.content.split("\n");
        const current = lines[lineIndex];
        const checked = checkbox.checked;
        lines[lineIndex] = current.replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]");
        setTabContent(tab.id, lines.join("\n"));
      });
    });

    window.requestAnimationFrame(() => {
      if (scrollParent) scrollParent.scrollTop = scrollTop;
    });
  }, [html, vault, tab.path, tab.content, tab.id, tree, openLinkTarget, setTabContent]);

  useEffect(() => {
    if (!jumpRequest || jumpRequest.tabId !== tab.id) return;
    const container = containerRef.current;
    if (!container) return;
    const headings = extractHeadings(tab.content);
    let index = -1;
    headings.forEach((heading, i) => {
      if (heading.line <= jumpRequest.line) index = i;
    });
    const elements = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const target = index >= 0 ? (elements[index] as HTMLElement | undefined) : undefined;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.remove("heading-flash");
      void target.offsetWidth;
      target.classList.add("heading-flash");
    } else {
      container.closest<HTMLElement>(".note-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [jumpRequest, tab.id, tab.content]);

  return <div className="markdown-reading" ref={containerRef} />;
}
