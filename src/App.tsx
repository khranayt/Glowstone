import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./store";
import { isTauri } from "./lib/api";
import { saveWorkspace } from "./lib/workspace";
import { TitleBar } from "./components/TitleBar";
import { ActivityBar } from "./components/ActivityBar";
import { Sidebar } from "./components/Sidebar";
import { RightSidebar } from "./components/RightSidebar";
import { StatusBar } from "./components/StatusBar";
import { EmptyState } from "./components/EmptyState";
import { NoteView } from "./components/NoteView";
import { GraphView } from "./components/GraphView";
import { Welcome } from "./components/Welcome";
import { SettingsModal } from "./components/SettingsModal";
import { QuickSwitcher, CommandPalette } from "./components/Palettes";
import { ConfirmDialog, PromptDialog, ContextMenu, ToastStack } from "./components/Dialogs";
import logo from "./assets/logo.png";

function EmptyTabView() {
  return (
    <div className="note-view mode-empty">
      <header className="note-header empty-tab-header">
        <div className="note-header-left">
          <span className="note-header-title">New tab</span>
        </div>
      </header>
      <EmptyState />
    </div>
  );
}

function Splash() {
  return (
    <div className="splash">
      <img src={logo} alt="Glowstone" />
      <div className="splash-title">Glowstone</div>
      <Loader2 size={18} className="spin" />
    </div>
  );
}

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const vault = useAppStore((s) => s.vault);
  const initializing = useAppStore((s) => s.initializing);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const sidebarView = useAppStore((s) => s.sidebarView);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const rightPanel = useAppStore((s) => s.rightPanel);
  const expanded = useAppStore((s) => s.expanded);
  const theme = useAppStore((s) => s.settings.theme);
  const fontSize = useAppStore((s) => s.settings.fontSize);
  const [resizing, setResizing] = useState(false);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  useEffect(() => {
    void useAppStore.getState().init();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
  }, [sidebarWidth]);

  useEffect(() => {
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`);
  }, [fontSize]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const state = useAppStore.getState();
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        if (state.switcherOpen) state.closeSwitcher();
        if (state.paletteOpen) state.closePalette();
        if (state.contextMenu) state.setContextMenu(null);
        if (state.vaultMenuOpen) state.setVaultMenuOpen(false);
        return;
      }

      if (event.altKey && !mod && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        void state.navigateHistory(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }

      if (!mod) {
        if (event.key === "F2") {
          const tab = state.tabs.find((item) => item.id === state.activeTabId);
          const target = state.selectedPath ?? (tab?.kind === "note" ? tab.path : null);
          if (target) {
            event.preventDefault();
            state.setSidebarView("files");
            state.startRename(target);
          }
        }
        return;
      }

      if (event.shiftKey && key === "f") {
        event.preventDefault();
        state.setSidebarView("search");
        return;
      }
      if (event.shiftKey && key === "g") {
        event.preventDefault();
        state.openGraphTab();
        return;
      }
      if (event.shiftKey && key === "e") {
        event.preventDefault();
        state.setSidebarView("files");
        return;
      }
      if (event.shiftKey && key === "tab") {
        event.preventDefault();
        if (state.tabs.length > 1 && state.activeTabId) {
          const index = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
          const next = state.tabs[(index - 1 + state.tabs.length) % state.tabs.length];
          if (next) state.activateTab(next.id);
        }
        return;
      }

      switch (key) {
        case "n":
          event.preventDefault();
          void state.createNote();
          break;
        case "s":
          event.preventDefault();
          void state.saveActiveTab();
          break;
        case "o":
          event.preventDefault();
          state.openSwitcher();
          break;
        case "p":
          event.preventDefault();
          state.openPalette();
          break;
        case "w":
          event.preventDefault();
          if (state.activeTabId) void state.closeTab(state.activeTabId);
          break;
        case "e": {
          const tab = state.tabs.find((item) => item.id === state.activeTabId);
          if (tab?.kind === "note") {
            event.preventDefault();
            void state.setMode(tab.id, tab.mode === "read" ? "edit" : "read");
          }
          break;
        }
        case ",":
          event.preventDefault();
          state.openSettings();
          break;
        case "tab":
          event.preventDefault();
          if (state.tabs.length > 1 && state.activeTabId) {
            const index = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
            const next = state.tabs[(index + 1) % state.tabs.length];
            if (next) state.activateTab(next.id);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<string[]>("vault-changed", (event) => {
      useAppStore.getState().handleExternalChanges(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        await useAppStore.getState().saveAll();
        await getCurrentWindow().destroy();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!vault) return;
    const timer = window.setTimeout(() => {
      const state = useAppStore.getState();
      if (!state.vault) return;
      const active = state.tabs.find((tab) => tab.id === state.activeTabId);
      saveWorkspace(state.vault.path, {
        tabs: state.tabs
          .filter((tab) => tab.kind === "note" && tab.path)
          .map((tab) => ({ path: tab.path!, mode: tab.mode })),
        activePath: active?.kind === "note" ? active.path ?? null : null,
        sidebarView: state.sidebarView,
        sidebarOpen: state.sidebarOpen,
        rightPanelOpen: state.rightPanelOpen,
        rightPanel: state.rightPanel,
        expanded: state.expanded,
        sidebarWidth: state.sidebarWidth,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    vault,
    vault?.path,
    tabs,
    activeTabId,
    sidebarView,
    sidebarOpen,
    rightPanelOpen,
    rightPanel,
    expanded,
    sidebarWidth,
  ]);

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = useAppStore.getState().sidebarWidth;
    setResizing(true);
    document.body.classList.add("is-resizing");
    const move = (moveEvent: MouseEvent) => {
      const width = Math.min(480, Math.max(200, startWidth + moveEvent.clientX - startX));
      useAppStore.getState().setSidebarWidth(width);
    };
    const up = () => {
      setResizing(false);
      document.body.classList.remove("is-resizing");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (!ready) return <Splash />;

  if (!vault) {
    return (
      <>
        <Welcome />
        <ToastStack />
        <PromptDialog />
      </>
    );
  }

  return (
    <div className={`app-shell ${resizing ? "resizing" : ""}`}>
      <TitleBar />
      <div className="app-body">
        <ActivityBar />
        {sidebarOpen && <Sidebar />}
        {sidebarOpen && (
          <div
            className="sidebar-resizer"
            onMouseDown={startResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        )}
        <main className="main-area">
          {!activeTab || activeTab.kind === "empty" ? (
            <EmptyTabView />
          ) : activeTab.kind === "graph" ? (
            <GraphView />
          ) : (
            <NoteView tab={activeTab} />
          )}
        </main>
        {rightPanelOpen && <RightSidebar />}
      </div>
      <StatusBar />

      {initializing && (
        <div className="app-loading-overlay">
          <Loader2 size={22} className="spin" />
          <span>Opening vault…</span>
        </div>
      )}

      <QuickSwitcher />
      <CommandPalette />
      <SettingsModal />
      <ConfirmDialog />
      <PromptDialog />
      <ContextMenu />
      <ToastStack />
    </div>
  );
}
