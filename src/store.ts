import { create } from "zustand";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "./lib/api";
import {
  activeTabOf,
  basename,
  dirname,
  findNoteByLink,
  flattenNotes,
  fuzzyFilter,
  joinPath,
  linkSignature,
  noteIdFromPath,
  titleFromPath,
  uid,
} from "./lib/utils";
import { loadWorkspace, saveWorkspace } from "./lib/workspace";
import type {
  ConfirmOptions,
  ContextMenuState,
  FileNode,
  GraphData,
  GraphScope,
  ImportKind,
  ImportResult,
  JumpRequest,
  MenuItem,
  NoteMode,
  PromptOptions,
  RightPanel,
  SearchFile,
  Settings,
  SidebarView,
  Tab,
  Theme,
  Toast,
  VaultInfo,
} from "./types";

export type SettingsSection = "appearance" | "editor" | "files" | "about";

export const defaultSettings: Settings = {
  theme: "dark",
  fontSize: 16,
  lineNumbers: false,
  readableLineLength: true,
  autoSave: true,
  spellcheck: false,
  confirmDelete: true,
  onboardingComplete: false,
  lastVault: null,
  recentVaults: [],
  recentFiles: [],
};

interface OpenNoteOptions {
  newTab?: boolean;
  line?: number;
  pushHistory?: boolean;
  mode?: NoteMode;
}

interface AppState {
  ready: boolean;
  initializing: boolean;
  loginError: string | null;
  vault: VaultInfo | null;
  settings: Settings;
  tree: FileNode[];
  tabs: Tab[];
  activeTabId: string | null;
  sidebarView: SidebarView;
  sidebarOpen: boolean;
  sidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanel: RightPanel;
  expanded: Record<string, boolean>;
  selectedPath: string | null;
  renamingPath: string | null;
  graph: GraphData | null;
  graphLoading: boolean;
  graphFocusPath: string | null;
  graphScope: GraphScope;
  graphDepth: number;
  savingCount: number;
  cursor: { line: number; col: number };
  searchQuery: string;
  searchResults: SearchFile[];
  searchLoading: boolean;
  searchCaseSensitive: boolean;
  switcherOpen: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  importOpen: boolean;
  vaultsOpen: boolean;
  vaultMenuOpen: boolean;
  confirm: ConfirmOptions | null;
  prompt: PromptOptions | null;
  toasts: Toast[];
  contextMenu: ContextMenuState | null;
  jumpRequest: JumpRequest | null;

  init: () => Promise<void>;
  openVaultByPath: (path: string) => Promise<void>;
  chooseVault: () => Promise<void>;
  createVault: () => Promise<void>;
  closeVault: () => Promise<void>;
  switchVault: () => Promise<void>;
  removeRecentVault: (path: string) => void;
  refreshTree: () => Promise<void>;
  refreshGraph: () => Promise<void>;
  setSidebarView: (view: SidebarView) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setRightPanelOpen: (open: boolean) => void;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel?: RightPanel) => void;
  setExpanded: (path: string, value: boolean) => void;
  toggleFolder: (path: string) => void;
  toggleFolders: () => void;
  expandToPath: (path: string) => void;
  selectPath: (path: string | null) => void;
  startRename: (path: string | null) => void;
  commitRename: (path: string, name: string) => Promise<void>;
  createNote: (parent?: string) => Promise<void>;
  createNoteNamed: (name: string, parent?: string) => Promise<string | null>;
  createFolder: (parent?: string) => Promise<void>;
  deletePath: (path: string) => void;
  movePath: (path: string, targetDir: string) => Promise<void>;
  openNote: (path: string, opts?: OpenNoteOptions) => Promise<string | null>;
  openGraphTab: () => void;
  setGraphFocusPath: (path: string | null) => void;
  setGraphScope: (scope: GraphScope) => void;
  setGraphDepth: (depth: number) => void;
  newTab: () => void;
  closeTab: (id: string) => Promise<void>;
  activateTab: (id: string) => void;
  setTabContent: (id: string, content: string) => void;
  saveTab: (id: string) => Promise<void>;
  saveActiveTab: () => Promise<void>;
  saveAll: () => Promise<void>;
  setMode: (id: string, mode: NoteMode) => Promise<void>;
  navigateHistory: (delta: number) => Promise<void>;
  requestJump: (tabId: string, line: number) => void;
  openLinkTarget: (target: string, fromPath?: string) => Promise<void>;
  commitInlineTitle: (title: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleTheme: () => void;
  setSearchQuery: (query: string) => void;
  setSearchCaseSensitive: (value: boolean) => void;
  runSearch: () => Promise<void>;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  openPalette: () => void;
  closePalette: () => void;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  openImport: () => void;
  closeImport: () => void;
  openVaults: () => void;
  closeVaults: () => void;
  importVault: (
    kind: ImportKind,
    source: string,
    parent: string,
    name: string,
  ) => Promise<ImportResult | null>;
  setVaultMenuOpen: (open: boolean) => void;
  setConfirm: (options: ConfirmOptions | null) => void;
  setPrompt: (options: PromptOptions | null) => void;
  toast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  setCursor: (cursor: { line: number; col: number }) => void;
  handleExternalChanges: (paths: string[]) => void;
}

const emptyTab = (): Tab => ({
  id: uid(),
  kind: "empty",
  title: "New tab",
  content: "",
  savedContent: "",
  mode: "edit",
  history: [],
  historyIndex: -1,
});

const noteTab = (path: string, content: string, mode: NoteMode, history?: string[], historyIndex?: number): Tab => ({
  id: uid(),
  kind: "note",
  path,
  title: titleFromPath(path),
  content,
  savedContent: content,
  mode,
  history: history ?? [path],
  historyIndex: historyIndex ?? 0,
});

let saveTimers = new Map<string, number>();
let settingsTimer: number | undefined;
let graphTimer: number | undefined;
let graphSeq = 0;
let treeSeq = 0;
let externalTimer: number | undefined;
const externalPaths = new Set<string>();
const selfSaves = new Map<string, number>();
const linkSignatures = new Map<string, string>();

const isRecentSelfSave = (path: string, windowMs = 1400) =>
  Date.now() - (selfSaves.get(path) ?? 0) < windowMs;

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
};

const scheduleSave = (id: string) => {
  const existing = saveTimers.get(id);
  if (existing) window.clearTimeout(existing);
  saveTimers.set(
    id,
    window.setTimeout(() => {
      saveTimers.delete(id);
      void useAppStore.getState().saveTab(id);
    }, 500),
  );
};

const scheduleGraphRefresh = (delay = 1200) => {
  if (graphTimer) window.clearTimeout(graphTimer);
  graphTimer = window.setTimeout(() => {
    graphTimer = undefined;
    void useAppStore.getState().refreshGraph();
  }, delay);
};

const ancestorsOf = (vaultPath: string, path: string): string[] => {
  const rel = path.startsWith(vaultPath) ? path.slice(vaultPath.length + 1) : path;
  const parts = rel.split("/").slice(0, -1);
  const result: string[] = [];
  let current = vaultPath;
  for (const part of parts) {
    current = joinPath(current, part);
    result.push(current);
  }
  return result;
};

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  initializing: false,
  loginError: null,
  vault: null,
  settings: { ...defaultSettings },
  tree: [],
  tabs: [],
  activeTabId: null,
  sidebarView: "files",
  sidebarOpen: true,
  sidebarWidth: 280,
  rightPanelOpen: false,
  rightPanel: "outline",
  expanded: {},
  selectedPath: null,
  renamingPath: null,
  graph: null,
  graphLoading: false,
  graphFocusPath: null,
  graphScope: "global",
  graphDepth: 2,
  savingCount: 0,
  cursor: { line: 1, col: 1 },
  searchQuery: "",
  searchResults: [],
  searchLoading: false,
  searchCaseSensitive: false,
  switcherOpen: false,
  paletteOpen: false,
  settingsOpen: false,
  settingsSection: "appearance",
  importOpen: false,
  vaultsOpen: false,
  vaultMenuOpen: false,
  confirm: null,
  prompt: null,
  toasts: [],
  contextMenu: null,
  jumpRequest: null,

  async init() {
    try {
      const settings = await api.getSettings();
      const merged = { ...defaultSettings, ...settings };
      applyTheme(merged.theme);
      set({ settings: merged });
      if (merged.lastVault) {
        await get().openVaultByPath(merged.lastVault);
      } else {
        set({ ready: true });
      }
    } catch (error) {
      set({ ready: true });
      get().toast(String(error), "error");
    }
  },

  async openVaultByPath(path) {
    const previous = get();
    if (previous.vault && previous.vault.path !== path) {
      await previous.saveAll();
      const active = previous.tabs.find((tab) => tab.id === previous.activeTabId);
      saveWorkspace(previous.vault.path, {
        tabs: previous.tabs
          .filter((tab) => tab.kind === "note" && tab.path)
          .map((tab) => ({ path: tab.path!, mode: tab.mode })),
        activePath: active?.kind === "note" ? active.path ?? null : null,
        sidebarView: previous.sidebarView,
        sidebarOpen: previous.sidebarOpen,
        rightPanelOpen: previous.rightPanelOpen,
        rightPanel: previous.rightPanel,
        expanded: previous.expanded,
        sidebarWidth: previous.sidebarWidth,
      });
    }
    set({ initializing: true, loginError: null });
    try {
      const vault = await api.openVault(path);
      const [tree, settings] = await Promise.all([api.listTree(vault.path), api.getSettings()]);
      const ws = loadWorkspace(vault.path);
      const tabs: Tab[] = [];
      await Promise.all(
        ws.tabs.slice(0, 24).map(async (entry) => {
          try {
            const content = await api.readFile(entry.path);
            tabs.push(noteTab(entry.path, content, entry.mode === "read" ? "read" : "edit"));
          } catch {
            /* note was removed since the workspace was saved */
          }
        }),
      );
      tabs.sort((a, b) => {
        const ai = ws.tabs.findIndex((t) => t.path === a.path);
        const bi = ws.tabs.findIndex((t) => t.path === b.path);
        return ai - bi;
      });
      if (tabs.length === 0) tabs.push(emptyTab());
      for (const tab of tabs) {
        if (tab.path) linkSignatures.set(tab.path, linkSignature(tab.content));
      }
      const active = tabs.find((t) => t.path === ws.activePath) ?? tabs[0];
      let expanded = { ...ws.expanded };
      for (const tab of tabs) {
        if (tab.path) {
          for (const folder of ancestorsOf(vault.path, tab.path)) expanded[folder] = true;
        }
      }
      const restoredView: SidebarView = ws.sidebarView === "search" ? "search" : "files";
      set({
        vault,
        settings: { ...defaultSettings, ...settings },
        tree,
        tabs,
        activeTabId: active.id,
        selectedPath: active.path ?? null,
        sidebarView: restoredView,
        sidebarOpen: ws.sidebarOpen,
        sidebarWidth: Math.min(480, Math.max(200, ws.sidebarWidth || 280)),
        rightPanelOpen: ws.rightPanelOpen,
        rightPanel: ws.rightPanel,
        expanded,
        renamingPath: null,
        searchQuery: "",
        searchResults: [],
        searchLoading: false,
        graphFocusPath: null,
        graphScope: "global",
        initializing: false,
        ready: true,
        graph: null,
        graphLoading: true,
      });
      applyTheme(get().settings.theme);
      if (!get().settings.onboardingComplete) get().updateSettings({ onboardingComplete: true });
      void get().refreshGraph();
    } catch (error) {
      set({ initializing: false, ready: true });
      get().toast(`Could not open vault: ${String(error)}`, "error");
    }
  },

  async chooseVault() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Open folder as vault",
      });
      if (typeof selected === "string" && selected) {
        await get().openVaultByPath(selected);
      }
    } catch (error) {
      get().toast(`Could not open the folder picker: ${String(error)}`, "error");
    }
  },

  async createVault() {
    try {
      const parent = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose a folder for the new vault",
      });
      if (typeof parent !== "string" || !parent) return;
      get().setPrompt({
        title: "Create new vault",
        label: "Vault name",
        initial: "My vault",
        placeholder: "My vault",
        confirmLabel: "Create vault",
        onSubmit: async (name) => {
          try {
            const folder = await api.createFolder(parent, name);
            await get().openVaultByPath(folder);
          } catch (error) {
            get().toast(`Could not create vault: ${String(error)}`, "error");
          }
        },
      });
    } catch (error) {
      get().toast(`Could not open the folder picker: ${String(error)}`, "error");
    }
  },

  async closeVault() {
    try {
      await get().saveAll();
      await api.closeVault();
    } catch {
      /* ignore */
    }
    set({
      vault: null,
      tree: [],
      tabs: [],
      activeTabId: null,
      graph: null,
      graphFocusPath: null,
      graphScope: "global",
      searchQuery: "",
      searchResults: [],
      searchLoading: false,
      selectedPath: null,
      renamingPath: null,
      sidebarView: "files",
      expanded: {},
      ready: true,
      settings: { ...get().settings, lastVault: null, onboardingComplete: true },
    });
    api.saveSettings(get().settings).catch(() => undefined);
  },

  async switchVault() {
    set({ vaultMenuOpen: false });
    await get().chooseVault();
  },

  removeRecentVault(path) {
    const settings = get().settings;
    get().updateSettings({
      recentVaults: settings.recentVaults.filter((item) => item !== path),
      lastVault: settings.lastVault === path ? null : settings.lastVault,
    });
  },

  async refreshTree() {
    const vault = get().vault;
    if (!vault) return;
    const seq = ++treeSeq;
    try {
      const [tree, stats] = await Promise.all([api.listTree(vault.path), api.stats(vault.path)]);
      if (seq !== treeSeq) return;
      set({ tree, vault: { ...stats } });
    } catch {
      /* the watcher may fire while a folder is being deleted */
    }
  },

  async refreshGraph() {
    const vault = get().vault;
    if (!vault) return;
    const seq = ++graphSeq;
    set({ graphLoading: true });
    try {
      const graph = await api.getGraph(vault.path);
      if (seq !== graphSeq) return;
      set({ graph, graphLoading: false });
    } catch {
      if (seq === graphSeq) set({ graphLoading: false });
    }
  },

  setSidebarView(view) {
    const state = get();
    if (state.sidebarOpen && state.sidebarView === view) {
      set({ sidebarOpen: false });
    } else {
      set({ sidebarView: view, sidebarOpen: true });
    }
  },

  toggleSidebar() {
    set((s) => ({ sidebarOpen: !s.sidebarOpen }));
  },

  setSidebarWidth(width) {
    set({ sidebarWidth: Math.min(480, Math.max(200, width)) });
  },

  setRightPanelOpen(open) {
    set({ rightPanelOpen: open });
  },

  setRightPanel(panel) {
    set({ rightPanel: panel, rightPanelOpen: true });
  },

  toggleRightPanel(panel = get().rightPanel) {
    const state = get();
    if (state.rightPanelOpen && state.rightPanel === panel) {
      set({ rightPanelOpen: false });
    } else {
      set({ rightPanelOpen: true, rightPanel: panel });
    }
  },

  setExpanded(path, value) {
    set((s) => ({ expanded: { ...s.expanded, [path]: value } }));
  },

  toggleFolder(path) {
    set((s) => ({ expanded: { ...s.expanded, [path]: !s.expanded[path] } }));
  },

  toggleFolders() {
    const state = get();
    const folders: string[] = [];
    const collect = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.isDir) {
          folders.push(node.path);
          collect(node.children);
        }
      }
    };
    collect(state.tree);
    if (folders.length === 0) return;
    const allOpen = folders.every((path) => state.expanded[path]);
    const expanded = { ...state.expanded };
    for (const path of folders) expanded[path] = !allOpen;
    set({ expanded });
  },

  expandToPath(path) {
    const vault = get().vault;
    if (!vault) return;
    set((s) => {
      const expanded = { ...s.expanded };
      for (const folder of ancestorsOf(vault.path, path)) expanded[folder] = true;
      return { expanded };
    });
  },

  selectPath(path) {
    set({ selectedPath: path });
  },

  startRename(path) {
    set({ renamingPath: path });
  },

  async commitRename(path, name) {
    const trimmed = name.trim();
    set({ renamingPath: null });
    if (!trimmed || trimmed === basename(path)) return;
    try {
      const oldPath = path;
      const newPath = await api.renameEntry(path, trimmed);
      if (newPath === oldPath) return;
      const state = get();
      const tabs = state.tabs.map((tab) => {
        if (!tab.path) return tab;
        if (tab.path === oldPath) {
          return {
            ...tab,
            path: newPath,
            title: titleFromPath(newPath),
            history: tab.history.map((p) => (p === oldPath ? newPath : p)),
          };
        }
        if (tab.path.startsWith(`${oldPath}/`)) {
          const remapped = newPath + tab.path.slice(oldPath.length);
          return {
            ...tab,
            path: remapped,
            title: titleFromPath(remapped),
            history: tab.history.map((p) =>
              p.startsWith(`${oldPath}/`) ? newPath + p.slice(oldPath.length) : p,
            ),
          };
        }
        return tab;
      });
      const expanded: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(state.expanded)) {
        if (key === oldPath || key.startsWith(`${oldPath}/`)) {
          expanded[newPath + key.slice(oldPath.length)] = value;
        } else {
          expanded[key] = value;
        }
      }
      set({
        tabs,
        expanded,
        selectedPath: state.selectedPath === oldPath ? newPath : state.selectedPath,
        vault: state.vault,
      });
      await get().refreshTree();
      scheduleGraphRefresh(400);
    } catch (error) {
      get().toast(String(error), "error");
    }
  },

  async createNote(parent) {
    const state = get();
    if (!state.vault) return;
    const active = activeTabOf(state.tabs, state.activeTabId);
    const targetDir = parent ?? (active?.path ? dirname(active.path) : state.vault.path);
    try {
      const path = await api.createNote(targetDir, "Untitled");
      for (const folder of ancestorsOf(state.vault.path, path)) {
        get().setExpanded(folder, true);
      }
      set({ sidebarView: "files", sidebarOpen: true });
      await get().refreshTree();
      await get().openNote(path, { newTab: false });
      scheduleGraphRefresh(500);
    } catch (error) {
      get().toast(`Could not create note: ${String(error)}`, "error");
    }
  },

  async createNoteNamed(name, parent) {
    const state = get();
    if (!state.vault) return null;
    const active = activeTabOf(state.tabs, state.activeTabId);
    const targetDir = parent ?? (active?.path ? dirname(active.path) : state.vault.path);
    try {
      const path = await api.createNote(targetDir, name);
      for (const folder of ancestorsOf(state.vault.path, path)) {
        get().setExpanded(folder, true);
      }
      await get().refreshTree();
      await get().openNote(path, { newTab: false });
      scheduleGraphRefresh(700);
      return path;
    } catch (error) {
      get().toast(`Could not create note: ${String(error)}`, "error");
      return null;
    }
  },

  async createFolder(parent) {
    const state = get();
    if (!state.vault) return;
    const active = activeTabOf(state.tabs, state.activeTabId);
    const targetDir = parent ?? (active?.path ? dirname(active.path) : state.vault.path);
    try {
      const path = await api.createFolder(targetDir, "New folder");
      set({ sidebarView: "files", sidebarOpen: true });
      if (targetDir !== state.vault.path) get().setExpanded(targetDir, true);
      await get().refreshTree();
      set({ selectedPath: path, renamingPath: path });
    } catch (error) {
      get().toast(`Could not create folder: ${String(error)}`, "error");
    }
  },

  deletePath(path) {
    const state = get();
    const name = basename(path);
    const isDir = Object.keys(state.expanded).some((key) => key.startsWith(`${path}/`)) ||
      state.tree.some(function find(node): boolean {
        if (node.path === path) return node.isDir;
        return node.children.some(find);
      });
    const perform = async () => {
      try {
        await api.deleteEntry(path);
        const tabs = state.tabs.filter(
          (tab) => !tab.path || (tab.path !== path && !tab.path.startsWith(`${path}/`)),
        );
        let activeTabId = state.activeTabId;
        if (!tabs.some((tab) => tab.id === activeTabId)) {
          activeTabId = tabs[tabs.length - 1]?.id ?? null;
        }
        if (tabs.length === 0) {
          const blank = emptyTab();
          tabs.push(blank);
          activeTabId = blank.id;
        }
        set({ tabs, activeTabId, selectedPath: null, renamingPath: null });
        await get().refreshTree();
        scheduleGraphRefresh(300);
        get().toast(`${isDir ? "Folder" : "Note"} deleted`, "info");
      } catch (error) {
        get().toast(String(error), "error");
      }
    };

    if (state.settings.confirmDelete) {
      set({
        confirm: {
          title: `Delete ${isDir ? "folder" : "note"}?`,
          message: `“${name}” will be permanently deleted. This cannot be undone.`,
          confirmLabel: "Delete",
          danger: true,
          onConfirm: perform,
        },
      });
    } else {
      void perform();
    }
  },

  async movePath(path, targetDir) {
    const state = get();
    if (!state.vault) return;
    try {
      const newPath = await api.moveEntry(path, targetDir);
      if (newPath === path) return;
      const tabs = state.tabs.map((tab) => {
        if (!tab.path) return tab;
        if (tab.path === path) {
          return {
            ...tab,
            path: newPath,
            title: titleFromPath(newPath),
            history: tab.history.map((p) => (p === path ? newPath : p)),
          };
        }
        if (tab.path.startsWith(`${path}/`)) {
          const remapped = newPath + tab.path.slice(path.length);
          return {
            ...tab,
            path: remapped,
            title: titleFromPath(remapped),
            history: tab.history.map((p) =>
              p.startsWith(`${path}/`) ? newPath + p.slice(path.length) : p,
            ),
          };
        }
        return tab;
      });
      set({ tabs, selectedPath: newPath });
      await get().refreshTree();
      scheduleGraphRefresh(300);
    } catch (error) {
      get().toast(String(error), "error");
    }
  },

  async openNote(path, opts = {}) {
    const state = get();
    if (!state.vault) return null;
    const vaultPath = state.vault.path;
    const existing = state.tabs.find((tab) => tab.kind === "note" && tab.path === path);
    if (existing) {
      set({ activeTabId: existing.id, selectedPath: path });
      expandAncestors(path);
      if (opts.line != null) get().requestJump(existing.id, opts.line);
      return existing.id;
    }

    let content: string;
    try {
      content = await api.readFile(path);
    } catch (error) {
      get().toast(`Could not open note: ${String(error)}`, "error");
      void get().refreshTree();
      return null;
    }
    if (get().vault?.path !== vaultPath) return null;

    const current = get();
    const activeIndex = current.tabs.findIndex((tab) => tab.id === current.activeTabId);
    const active = activeIndex >= 0 ? current.tabs[activeIndex] : null;
    const replaceActive =
      !opts.newTab &&
      active != null &&
      (active.kind === "empty" ||
        (active.kind === "note" && opts.pushHistory !== false && active.path !== path));

    let tabId: string;
    if (replaceActive && active && activeIndex >= 0) {
      // Never discard unsaved edits when a note is replaced in the active tab.
      if (active.kind === "note" && active.content !== active.savedContent) {
        await get().saveTab(active.id);
      }
      const history =
        active.kind === "note" && active.path
          ? [...active.history.slice(0, active.historyIndex + 1), path]
          : [path];
      const replaced: Tab = {
        ...active,
        kind: "note",
        path,
        title: titleFromPath(path),
        content,
        savedContent: content,
        history,
        historyIndex: history.length - 1,
        pendingLine: null,
        error: undefined,
      };
      set((s) => {
        const tabs = [...s.tabs];
        tabs[activeIndex] = replaced;
        return { tabs, activeTabId: replaced.id, selectedPath: path };
      });
      tabId = replaced.id;
    } else {
      const tab = noteTab(path, content, opts.mode ?? "edit");
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        selectedPath: path,
      }));
      tabId = tab.id;
    }

    linkSignatures.set(path, linkSignature(content));
    expandAncestors(path);
    api.addRecentFile(path).catch(() => undefined);
    set((s) => ({
      settings: {
        ...s.settings,
        recentFiles: [path, ...s.settings.recentFiles.filter((p) => p !== path)].slice(0, 30),
      },
    }));
    if (opts.line != null) get().requestJump(tabId, opts.line);
    return tabId;
  },

  openGraphTab() {
    const state = get();
    const active = activeTabOf(state.tabs, state.activeTabId);
    const focusPath = active?.kind === "note" ? active.path ?? null : state.graphFocusPath;
    const existing = state.tabs.find((tab) => tab.kind === "graph");
    if (existing) {
      set({
        activeTabId: existing.id,
        selectedPath: null,
        graphFocusPath: focusPath,
        graphScope: "global",
      });
      if (!state.graph && !state.graphLoading) void get().refreshGraph();
      return;
    }
    const tab: Tab = {
      id: uid(),
      kind: "graph",
      title: "Graph",
      content: "",
      savedContent: "",
      mode: "edit",
      history: [],
      historyIndex: -1,
    };
    if (active && active.kind === "empty") {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === active.id ? tab : t)),
        activeTabId: tab.id,
        selectedPath: null,
        graphFocusPath: focusPath,
        graphScope: "global",
      }));
    } else {
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        selectedPath: null,
        graphFocusPath: focusPath,
        graphScope: "global",
      }));
    }
    if (!state.graph && !state.graphLoading) void get().refreshGraph();
  },

  setGraphFocusPath(path) {
    set({ graphFocusPath: path });
  },

  setGraphScope(scope) {
    set({ graphScope: scope });
  },

  setGraphDepth(depth) {
    set({ graphDepth: Math.min(4, Math.max(1, depth)) });
  },

  newTab() {
    const tab = emptyTab();
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, selectedPath: null }));
  },

  async closeTab(id) {
    const state = get();
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.kind === "note" && tab.content !== tab.savedContent) {
      await get().saveTab(id);
    }
    const current = get();
    const index = current.tabs.findIndex((t) => t.id === id);
    let tabs = current.tabs.filter((t) => t.id !== id);
    let activeTabId = current.activeTabId;
    if (activeTabId === id) {
      activeTabId = tabs[Math.max(0, index - 1)]?.id ?? tabs[0]?.id ?? null;
    }
    if (tabs.length === 0) {
      const blank = emptyTab();
      tabs = [blank];
      activeTabId = blank.id;
    }
    set({ tabs, activeTabId });
  },

  activateTab(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    set({ activeTabId: id, selectedPath: tab.path ?? null });
    if (tab.path) expandAncestors(tab.path);
  },

  setTabContent(id, content) {
    set((s) => ({
      tabs: s.tabs.map((tab) => (tab.id === id ? { ...tab, content } : tab)),
    }));
    if (get().settings.autoSave) scheduleSave(id);
  },

  async saveTab(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.kind !== "note" || !tab.path) return;
    if (tab.content === tab.savedContent) return;
    const path = tab.path;
    const content = tab.content;
    set((s) => ({ savingCount: s.savingCount + 1 }));
    try {
      await api.writeFile(path, content);
      selfSaves.set(path, Date.now());
      api.addRecentFile(path).catch(() => undefined);
      set((s) => ({
        savingCount: Math.max(0, s.savingCount - 1),
        tabs: s.tabs.map((t) =>
          t.id === id ? { ...t, savedContent: content } : t,
        ),
      }));
      const signature = linkSignature(content);
      const previous = linkSignatures.get(path);
      linkSignatures.set(path, signature);
      if (previous !== undefined && previous !== signature) {
        scheduleGraphRefresh(1500);
      }
      const latest = get().tabs.find((t) => t.id === id);
      if (latest && latest.content !== latest.savedContent && get().settings.autoSave) {
        scheduleSave(id);
      }
    } catch (error) {
      set((s) => ({ savingCount: Math.max(0, s.savingCount - 1) }));
      get().toast(`Could not save “${basename(path)}”: ${String(error)}`, "error");
    }
  },

  async saveActiveTab() {
    const id = get().activeTabId;
    if (id) await get().saveTab(id);
  },

  async saveAll() {
    const tabs = get().tabs.filter((t) => t.kind === "note");
    await Promise.all(tabs.map((t) => get().saveTab(t.id)));
  },

  async setMode(id, mode) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.kind !== "note") return;
    if (mode === "read" && tab.content !== tab.savedContent) {
      await get().saveTab(id);
    }
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, mode } : t)),
    }));
  },

  async navigateHistory(delta) {
    const state = get();
    const tab = activeTabOf(state.tabs, state.activeTabId);
    if (!tab || tab.kind !== "note") return;
    const targetIndex = tab.historyIndex + delta;
    const target = tab.history[targetIndex];
    if (!target) return;
    try {
      const content = await api.readFile(target);
      if (get().vault?.path !== state.vault?.path) return;
      set((s) => ({
        selectedPath: target,
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                path: target,
                title: titleFromPath(target),
                content,
                savedContent: content,
                historyIndex: targetIndex,
                pendingLine: null,
              }
            : t,
        ),
      }));
      linkSignatures.set(target, linkSignature(content));
      expandAncestors(target);
    } catch {
      get().toast("That note no longer exists", "error");
    }
  },

  requestJump(tabId, line) {
    set({ jumpRequest: { tabId, line, nonce: Date.now() + Math.random() } });
  },

  async openLinkTarget(target, fromPath) {
    const state = get();
    if (!state.vault) return;
    const note = findNoteByLink(state.tree, target, fromPath);
    if (note) {
      await get().openNote(note.path, { newTab: false });
      return;
    }
    const clean = target.split("|")[0].split("#")[0].trim();
    if (!clean) return;
    const parent = fromPath ? dirname(fromPath) : state.vault.path;
    try {
      const path = await api.createNote(parent, clean.split("/").pop() || "Untitled");
      await get().refreshTree();
      await get().openNote(path, { newTab: false });
      get().toast("Note created", "success");
    } catch (error) {
      get().toast(String(error), "error");
    }
  },

  async commitInlineTitle(title) {
    const state = get();
    const tab = activeTabOf(state.tabs, state.activeTabId);
    if (!tab || tab.kind !== "note" || !tab.path) return;
    const clean = title.trim().replace(/[\\/:*?"<>|]/g, "");
    if (!clean || clean === tab.title) return;
    try {
      if (tab.content !== tab.savedContent) await get().saveTab(tab.id);
      const newPath = await api.renameEntry(tab.path, clean);
      const oldPath = tab.path;
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                path: newPath,
                title: titleFromPath(newPath),
                history: t.history.map((p) => (p === oldPath ? newPath : p)),
              }
            : t,
        ),
        selectedPath: newPath,
      }));
      await get().refreshTree();
      scheduleGraphRefresh(500);
    } catch (error) {
      get().toast(String(error), "error");
    }
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    if (patch.theme) applyTheme(patch.theme);
    if (settingsTimer) window.clearTimeout(settingsTimer);
    settingsTimer = window.setTimeout(() => {
      settingsTimer = undefined;
      api.saveSettings(settings).catch((error) => get().toast(String(error), "error"));
    }, 300);
  },

  toggleTheme() {
    get().updateSettings({ theme: get().settings.theme === "dark" ? "light" : "dark" });
  },

  setSearchQuery(query) {
    set({ searchQuery: query });
  },

  setSearchCaseSensitive(value) {
    set({ searchCaseSensitive: value });
    void get().runSearch();
  },

  async runSearch() {
    const state = get();
    const query = state.searchQuery;
    if (!state.vault || !query.trim()) {
      set({ searchResults: [], searchLoading: false });
      return;
    }
    set({ searchLoading: true });
    try {
      const results = await api.searchVault(state.vault.path, query, state.searchCaseSensitive);
      if (get().searchQuery !== query) return;
      set({ searchResults: results, searchLoading: false });
    } catch (error) {
      set({ searchLoading: false });
      get().toast(String(error), "error");
    }
  },

  openSwitcher() {
    set({ switcherOpen: true, paletteOpen: false, contextMenu: null, vaultMenuOpen: false });
  },
  closeSwitcher() {
    set({ switcherOpen: false });
  },
  openPalette() {
    set({ paletteOpen: true, switcherOpen: false, contextMenu: null, vaultMenuOpen: false });
  },
  closePalette() {
    set({ paletteOpen: false });
  },
  openSettings(section = get().settingsSection) {
    set({ settingsOpen: true, settingsSection: section, paletteOpen: false, switcherOpen: false, vaultMenuOpen: false });
  },
  closeSettings() {
    set({ settingsOpen: false });
  },
  openImport() {
    set({
      importOpen: true,
      paletteOpen: false,
      switcherOpen: false,
      vaultMenuOpen: false,
      settingsOpen: false,
      vaultsOpen: false,
    });
  },
  closeImport() {
    set({ importOpen: false });
    if (!get().vault && !get().settings.onboardingComplete) {
      get().updateSettings({ onboardingComplete: true });
    }
  },
  openVaults() {
    set({
      vaultsOpen: true,
      importOpen: false,
      paletteOpen: false,
      switcherOpen: false,
      vaultMenuOpen: false,
      settingsOpen: false,
    });
  },
  closeVaults() {
    set({ vaultsOpen: false });
  },
  async importVault(kind, source, parent, name) {
    try {
      const result = await api.importVault(kind, source, parent, name);
      await get().openVaultByPath(result.path);
      const label = result.imported === 1 ? "note" : "notes";
      get().toast(`Imported ${result.imported} ${label}`, "success");
      return result;
    } catch (error) {
      get().toast(`Import failed: ${String(error)}`, "error");
      return null;
    }
  },
  setVaultMenuOpen(open) {
    set({ vaultMenuOpen: open });
  },
  setConfirm(options) {
    set({ confirm: options });
  },
  setPrompt(options) {
    set({ prompt: options });
  },
  toast(message, kind = "info") {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, message, kind }] }));
    window.setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  setContextMenu(menu) {
    set({ contextMenu: menu ? { ...menu } : null });
  },
  setCursor(cursor) {
    const current = get().cursor;
    if (current.line !== cursor.line || current.col !== cursor.col) set({ cursor });
  },

  handleExternalChanges(paths) {
    const state = get();
    if (!state.vault) return;
    const relevant = paths.filter((p) => !isRecentSelfSave(p));
    if (relevant.length === 0) return;
    for (const path of relevant) externalPaths.add(path);
    if (externalTimer) window.clearTimeout(externalTimer);
    externalTimer = window.setTimeout(async () => {
      externalTimer = undefined;
      const pending = [...externalPaths];
      externalPaths.clear();
      if (!get().vault) return;
      await get().refreshTree();
      const stateNow = get();
      let contentChanged = false;
      for (const tab of stateNow.tabs) {
        if (tab.kind !== "note" || !tab.path) continue;
        if (!pending.some((p) => p === tab.path || tab.path?.startsWith(`${p}/`))) continue;
        if (tab.content !== tab.savedContent) continue;
        if (isRecentSelfSave(tab.path)) continue;
        try {
          const exists = await api.fileExists(tab.path);
          if (!exists) {
            await get().closeTab(tab.id);
            continue;
          }
          const content = await api.readFile(tab.path);
          if (content !== tab.content) {
            linkSignatures.set(tab.path, linkSignature(content));
            contentChanged = true;
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tab.id ? { ...t, content, savedContent: content } : t,
              ),
            }));
          }
        } catch {
          /* ignore transient read errors */
        }
      }
      if (contentChanged || pending.some((p) => /\.(md|markdown)$/i.test(p))) {
        scheduleGraphRefresh(700);
      }
    }, 380);
  },
}));

// Expanded-folder helpers use the store after it is created.
const expandAncestors = (path: string) => {
  const state = useAppStore.getState();
  if (!state.vault) return;
  const folders = ancestorsOf(state.vault.path, path);
  if (folders.length === 0) return;
  const expanded = { ...state.expanded };
  for (const folder of folders) expanded[folder] = true;
  useAppStore.setState({ expanded });
};

export const noteIdForTab = (vault: VaultInfo | null, tab: Tab | null) => {
  if (!vault || !tab?.path) return null;
  return noteIdFromPath(vault.path, tab.path);
};

export const noteList = (tree: FileNode[]) => flattenNotes(tree);

export const searchNotes = (tree: FileNode[], query: string) =>
  fuzzyFilter(flattenNotes(tree), query, (note) => `${note.title} ${note.folder}`);
