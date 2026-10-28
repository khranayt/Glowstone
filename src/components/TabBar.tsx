import { useEffect, useRef, type MouseEvent } from "react";
import { FileText, Frame, Plus, Table2, Waypoints, X } from "lucide-react";
import { useAppStore } from "../store";
import { useT } from "../lib/useT";
import type { MenuItem, Tab } from "../types";

const isFileTab = (tab: Tab) =>
  tab.kind === "note" || tab.kind === "base" || tab.kind === "canvas";

export function TabBar() {
  const t = useT();
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const activateTab = useAppStore((s) => s.activateTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const newTab = useAppStore((s) => s.newTab);
  const setContextMenu = useAppStore((s) => s.setContextMenu);
  const reveal = useRef(new Map<string, HTMLDivElement>());

  const tabLabel = (tab: Tab) => {
    if (tab.kind === "graph") return t("Graph");
    if (tab.kind === "empty") return t("New tab");
    return tab.title || t("Untitled");
  };

  useEffect(() => {
    if (!activeTabId) return;
    reveal.current.get(activeTabId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  const closeMany = async (ids: string[]) => {
    for (const id of ids) {
      await closeTab(id);
    }
  };

  const openTabMenu = (event: MouseEvent, tab: Tab) => {
    event.preventDefault();
    event.stopPropagation();
    const items: MenuItem[] = [
      { label: t("Close tab"), action: () => void closeTab(tab.id) },
      {
        label: t("Close others"),
        action: () => {
          void closeMany(tabs.filter((t) => t.id !== tab.id).map((t) => t.id));
        },
      },
      {
        label: t("Close all"),
        action: () => {
          void closeMany(tabs.map((t) => t.id));
        },
      },
    ];
    if (isFileTab(tab) && tab.path) {
      items.push(
        { label: "", separator: true },
        {
          label: t("Copy note path"),
          action: () => {
            void navigator.clipboard.writeText(tab.path!);
          },
        },
      );
    }
    setContextMenu({ x: event.clientX, y: event.clientY, items });
  };

  return (
    <div className="tab-bar" data-tauri-drag-region>
      <div className="tab-strip">
        {tabs.map((tab) => {
          const dirty = isFileTab(tab) && tab.content !== tab.savedContent;
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              ref={(element) => {
                if (element) reveal.current.set(tab.id, element);
                else reveal.current.delete(tab.id);
              }}
              className={`tab ${active ? "tab-active" : ""} ${dirty ? "tab-dirty" : ""}`}
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  void closeTab(tab.id);
                }
              }}
              onClick={() => activateTab(tab.id)}
              onContextMenu={(event) => openTabMenu(event, tab)}
              title={tab.path ?? tabLabel(tab)}
            >
              <span className="tab-icon">
                {tab.kind === "graph" ? (
                  <Waypoints size={14} />
                ) : tab.kind === "note" ? (
                  <FileText size={14} />
                ) : tab.kind === "base" ? (
                  <Table2 size={14} />
                ) : tab.kind === "canvas" ? (
                  <Frame size={14} />
                ) : null}
              </span>
              <span className="tab-title">{tabLabel(tab)}</span>
              {dirty && <span className="tab-dirty-dot" />}
              <button
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTab(tab.id);
                }}
                aria-label={`${t("Close tab")}: ${tabLabel(tab)}`}
                title={t("Close tab")}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
        <button
          className="tab-new"
          onClick={newTab}
          title={t("New tab")}
          aria-label={t("New tab")}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
