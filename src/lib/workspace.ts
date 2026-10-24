import type { WorkspaceState } from "../types";

const KEY_PREFIX = "glowstone:workspace:";

const defaults: WorkspaceState = {
  tabs: [],
  activePath: null,
  sidebarView: "files",
  sidebarOpen: true,
  rightPanelOpen: false,
  rightPanel: "outline",
  expanded: {},
  sidebarWidth: 280,
};

export const loadWorkspace = (vaultPath: string): WorkspaceState => {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + vaultPath);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    return {
      ...defaults,
      ...parsed,
      tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
      expanded: parsed.expanded && typeof parsed.expanded === "object" ? parsed.expanded : {},
    };
  } catch {
    return { ...defaults };
  }
};

export const saveWorkspace = (vaultPath: string, state: WorkspaceState) => {
  try {
    localStorage.setItem(KEY_PREFIX + vaultPath, JSON.stringify(state));
  } catch {
    /* storage can be full — not critical */
  }
};

export const forgetWorkspace = (vaultPath: string) => {
  try {
    localStorage.removeItem(KEY_PREFIX + vaultPath);
  } catch {
    /* ignore */
  }
};
