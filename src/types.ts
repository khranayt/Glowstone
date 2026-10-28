export type Theme = "dark" | "light";
export type SidebarView = "files" | "search";
export type GraphScope = "global" | "local";
export type RightPanel = "outline" | "backlinks";
export type NoteMode = "edit" | "read";
export type DefaultFileMode = "last" | "new" | "specific";
export type NewNoteLocation = "root" | "current" | "folder";
export type AttachmentLocation = "root" | "current" | "subfolder" | "folder";

export interface Settings {
  theme: Theme;
  fontSize: number;
  lineNumbers: boolean;
  readableLineLength: boolean;
  autoSave: boolean;
  spellcheck: boolean;
  confirmDelete: boolean;
  onboardingComplete: boolean;
  defaultFileToOpen: DefaultFileMode;
  defaultFile: string;
  alwaysFocusNewTabs: boolean;
  newNoteLocation: NewNoteLocation;
  newNoteFolder: string;
  attachmentLocation: AttachmentLocation;
  attachmentFolder: string;
  lastVault: string | null;
  recentVaults: string[];
  recentFiles: string[];
}

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  ext: string;
  children: FileNode[];
}

export interface VaultInfo {
  name: string;
  path: string;
  noteCount: number;
}

export interface GraphNode {
  id: string;
  title: string;
  path: string;
  folder: string;
  degree: number;
  unresolved: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphGroup {
  id: string;
  name: string;
  color: string;
  terms: string[];
}

export type ImportKind =
  | "obsidian"
  | "logseq"
  | "markdown"
  | "text"
  | "html"
  | "notion"
  | "evernote";

export interface ImportResult {
  path: string;
  imported: number;
  skipped: number;
}

export interface SearchHit {
  line: number;
  text: string;
}

export interface SearchFile {
  path: string;
  title: string;
  matches: SearchHit[];
}

export type TabKind = "note" | "graph" | "empty";

export interface Tab {
  id: string;
  kind: TabKind;
  path?: string;
  title: string;
  content: string;
  savedContent: string;
  mode: NoteMode;
  history: string[];
  historyIndex: number;
  pendingLine?: number | null;
  loading?: boolean;
  error?: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export interface PromptOptions {
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void | Promise<void>;
}

export interface Toast {
  id: string;
  message: string;
  kind: "info" | "success" | "error";
}

export interface MenuItem {
  label: string;
  action?: () => void;
  danger?: boolean;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export interface JumpRequest {
  tabId: string;
  line: number;
  nonce: number;
}

export interface WorkspaceState {
  tabs: { path: string; mode: NoteMode }[];
  activePath: string | null;
  sidebarView: SidebarView;
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  rightPanel: RightPanel;
  expanded: Record<string, boolean>;
  sidebarWidth: number;
}
