import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FilePlus2,
  FolderPlus,
  Maximize2,
  PanelLeft,
  RefreshCw,
  Save,
  Search,
  Settings,
  SunMoon,
  Waypoints,
  X,
  Plus,
  ArrowRight,
  Type,
} from "lucide-react";
import { useAppStore } from "../store";
import { flattenNotes, fuzzyFilter, relPath } from "../lib/utils";
import type { FlatNote } from "../lib/utils";

// ---------------------------------------------------------------------------
// Quick switcher
// ---------------------------------------------------------------------------

export function QuickSwitcher() {
  const open = useAppStore((s) => s.switcherOpen);
  const close = useAppStore((s) => s.closeSwitcher);
  const tree = useAppStore((s) => s.tree);
  const vault = useAppStore((s) => s.vault);
  const settings = useAppStore((s) => s.settings);
  const openNote = useAppStore((s) => s.openNote);
  const createNoteNamed = useAppStore((s) => s.createNoteNamed);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const notes = useMemo(() => flattenNotes(tree), [tree]);

  const recent = useMemo(() => {
    const byPath = new Map(notes.map((note) => [note.path, note]));
    return settings.recentFiles.map((path) => byPath.get(path)).filter(Boolean).slice(0, 8) as FlatNote[];
  }, [notes, settings.recentFiles]);

  const results = useMemo(() => {
    if (!query.trim()) return recent.length > 0 ? recent : notes.slice(0, 30);
    return fuzzyFilter(notes, query, (note) => `${note.title} ${note.folder} ${note.name}`).slice(0, 60);
  }, [notes, query, recent]);

  const showCreate = query.trim().length > 0;
  const total = results.length + (showCreate ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  const choose = (index: number) => {
    if (index < results.length) {
      const note = results[index];
      close();
      void openNote(note.path);
    } else if (showCreate) {
      const name = query.trim();
      close();
      void createNoteNamed(name);
    }
  };

  return (
    <div className="palette-overlay" onMouseDown={() => close()}>
      <div className="palette switcher" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input-row">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Go to file or create a note…"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((value) => (total === 0 ? 0 : (value + 1) % total));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((value) => (total === 0 ? 0 : (value - 1 + total) % total));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(selected);
              }
            }}
          />
          <kbd className="palette-esc">Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {!query.trim() && (
            <div className="palette-section-label">
              {recent.length > 0 ? "Recently opened" : "Notes"}
            </div>
          )}
          {results.map((note, index) => {
            const rel = vault ? relPath(vault.path, note.path) : note.path;
            const folder = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
            return (
              <button
                key={note.path}
                data-index={index}
                className={`palette-item ${selected === index ? "selected" : ""}`}
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(index)}
              >
                <span className="palette-item-icon">
                  <Type size={15} />
                </span>
                <span className="palette-item-text">
                  <span className="palette-item-title">{note.title}</span>
                  {folder && <span className="palette-item-sub">{folder}</span>}
                </span>
              </button>
            );
          })}
          {showCreate && (
            <button
              data-index={results.length}
              className={`palette-item ${selected === results.length ? "selected" : ""}`}
              onMouseEnter={() => setSelected(results.length)}
              onClick={() => choose(results.length)}
            >
              <span className="palette-item-icon">
                <Plus size={15} />
              </span>
              <span className="palette-item-text">
                <span className="palette-item-title">Create note “{query.trim()}”</span>
              </span>
            </button>
          )}
          {results.length === 0 && !showCreate && (
            <div className="palette-empty">Start typing to search your vault.</div>
          )}
        </div>
        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Command palette
// ---------------------------------------------------------------------------

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const open = useAppStore((s) => s.paletteOpen);
  const close = useAppStore((s) => s.closePalette);
  const store = useAppStore();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commands: Command[] = useMemo(() => {
    const activeTab = store.tabs.find((tab) => tab.id === store.activeTabId);
    const list: Command[] = [
      {
        id: "new-note",
        label: "Create new note",
        shortcut: "Ctrl N",
        icon: <FilePlus2 size={15} />,
        run: () => void store.createNote(),
      },
      {
        id: "new-folder",
        label: "Create new folder",
        icon: <FolderPlus size={15} />,
        run: () => void store.createFolder(),
      },
      {
        id: "open-switcher",
        label: "Go to file",
        shortcut: "Ctrl O",
        icon: <Search size={15} />,
        run: store.openSwitcher,
      },
      {
        id: "search",
        label: "Search in vault",
        shortcut: "Ctrl Shift F",
        icon: <Search size={15} />,
        run: () => store.setSidebarView("search"),
      },
      {
        id: "graph",
        label: "Open graph view",
        shortcut: "Ctrl Shift G",
        icon: <Waypoints size={15} />,
        run: store.openGraphTab,
      },
      {
        id: "toggle-sidebar",
        label: "Toggle sidebar",
        icon: <PanelLeft size={15} />,
        run: store.toggleSidebar,
      },
      {
        id: "reading",
        label: activeTab?.mode === "read" ? "Switch to editing view" : "Switch to reading view",
        shortcut: "Ctrl E",
        icon: <BookOpen size={15} />,
        run: () => {
          if (activeTab && activeTab.kind === "note") {
            void store.setMode(activeTab.id, activeTab.mode === "read" ? "edit" : "read");
          }
        },
      },
      {
        id: "save",
        label: "Save current note",
        shortcut: "Ctrl S",
        icon: <Save size={15} />,
        run: () => void store.saveActiveTab(),
      },
      {
        id: "close-tab",
        label: "Close current tab",
        shortcut: "Ctrl W",
        icon: <X size={15} />,
        run: () => {
          if (store.activeTabId) void store.closeTab(store.activeTabId);
        },
      },
      {
        id: "theme",
        label: store.settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: <SunMoon size={15} />,
        run: store.toggleTheme,
      },
      {
        id: "settings",
        label: "Open settings",
        shortcut: "Ctrl ,",
        icon: <Settings size={15} />,
        run: () => store.openSettings(),
      },
      {
        id: "refresh",
        label: "Refresh vault and graph",
        icon: <RefreshCw size={15} />,
        run: () => {
          void store.refreshTree();
          void store.refreshGraph();
        },
      },
      {
        id: "switch-vault",
        label: "Switch vault…",
        icon: <Maximize2 size={15} />,
        run: () => void store.chooseVault(),
      },
    ];
    return list;
  }, [store]);

  const results = useMemo(
    () => fuzzyFilter(commands, query, (command) => command.label),
    [commands, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  const run = (index: number) => {
    const command = results[index];
    close();
    window.setTimeout(() => command?.run(), 10);
  };

  return (
    <div className="palette-overlay" onMouseDown={() => close()}>
      <div className="palette command-palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input-row">
          <ArrowRight size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Type a command…"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((value) => (results.length ? (value + 1) % results.length : 0));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((value) =>
                  results.length ? (value - 1 + results.length) % results.length : 0,
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (results.length) run(selected);
              }
            }}
          />
          <kbd className="palette-esc">Esc</kbd>
        </div>
        <div className="palette-list">
          {results.map((command, index) => (
            <button
              key={command.id}
              className={`palette-item ${selected === index ? "selected" : ""}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => run(index)}
            >
              <span className="palette-item-icon">{command.icon}</span>
              <span className="palette-item-text">
                <span className="palette-item-title">{command.label}</span>
              </span>
              {command.shortcut && <span className="palette-shortcut">{command.shortcut}</span>}
            </button>
          ))}
          {results.length === 0 && <div className="palette-empty">No matching commands.</div>}
        </div>
        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>↵</kbd> to run
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
