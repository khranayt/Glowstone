import type { Bookmark } from "../types";

const KEY_PREFIX = "glowstone:bookmarks:";

export const loadBookmarks = (vaultPath: string): Bookmark[] => {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + vaultPath);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Bookmark[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item && typeof item.path === "string" && typeof item.title === "string",
    );
  } catch {
    return [];
  }
};

export const saveBookmarks = (vaultPath: string, bookmarks: Bookmark[]) => {
  try {
    localStorage.setItem(KEY_PREFIX + vaultPath, JSON.stringify(bookmarks));
  } catch {
    /* bookmarks are a convenience; storage may be unavailable */
  }
};
