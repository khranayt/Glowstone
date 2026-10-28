import type { GraphGroup } from "../types";

const KEY_PREFIX = "glowstone:graph-groups:";

export const GROUP_COLORS = [
  "#e06c75",
  "#61afef",
  "#98c379",
  "#c678dd",
  "#56b6c2",
  "#d19a66",
  "#f472b6",
  "#7f9cf5",
  "#4ade80",
  "#e3b341",
];

export const loadGraphGroups = (vaultPath: string): GraphGroup[] => {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + vaultPath);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GraphGroup[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (group) =>
          group &&
          typeof group.id === "string" &&
          typeof group.name === "string" &&
          typeof group.color === "string" &&
          Array.isArray(group.terms),
      )
      .map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
        terms: group.terms
          .filter((term): term is string => typeof term === "string")
          .map((term) => term.toLowerCase()),
      }));
  } catch {
    return [];
  }
};

export const saveGraphGroups = (vaultPath: string, groups: GraphGroup[]) => {
  try {
    localStorage.setItem(KEY_PREFIX + vaultPath, JSON.stringify(groups));
  } catch {
    /* storage can be unavailable; groups are a convenience, not data */
  }
};

/** First group whose terms all appear in the node's title, folder or id. */
export const groupForNode = (
  node: { id: string; title: string; folder: string },
  groups: GraphGroup[],
): GraphGroup | null => {
  if (groups.length === 0) return null;
  const haystack = `${node.title}\n${node.folder}\n${node.id}`.toLowerCase();
  for (const group of groups) {
    if (group.terms.length === 0) continue;
    if (group.terms.every((term) => haystack.includes(term))) return group;
  }
  return null;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "these",
  "those",
  "into",
  "over",
  "under",
  "about",
  "after",
  "before",
  "when",
  "where",
  "what",
  "which",
  "while",
  "your",
  "you",
  "our",
  "their",
  "them",
  "they",
  "his",
  "her",
  "its",
  "are",
  "was",
  "were",
  "been",
  "being",
  "have",
  "has",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "not",
  "but",
  "all",
  "any",
  "each",
  "more",
  "most",
  "some",
  "such",
  "than",
  "then",
  "there",
  "here",
  "also",
  "just",
  "only",
  "very",
  "much",
  "many",
  "one",
  "two",
  "new",
  "note",
  "notes",
  "untitled",
  "md",
  "markdown",
  "и",
  "в",
  "во",
  "не",
  "на",
  "с",
  "со",
  "как",
  "что",
  "это",
  "для",
  "по",
  "из",
  "от",
  "до",
  "или",
  "но",
  "же",
  "бы",
  "ли",
  "при",
  "над",
  "под",
  "про",
  "без",
  "через",
  "между",
  "так",
  "там",
  "тут",
  "где",
  "когда",
  "если",
  "то",
  "все",
  "всё",
  "его",
  "её",
  "их",
  "мы",
  "вы",
  "они",
  "она",
  "оно",
  "я",
  "ты",
  "мой",
  "моя",
  "мои",
  "наш",
  "ваш",
  "свой",
  "этот",
  "эта",
  "эти",
  "тот",
  "та",
  "те",
]);

export const wordsOf = (text: string): string[] => {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!matches) return [];
  return matches.filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
};

/** Words that appear in every selected note (title + folder). */
export const commonWords = (texts: string[], limit = 6): string[] => {
  if (texts.length === 0) return [];
  const sets = texts.map((text) => new Set(wordsOf(text)));
  if (sets.some((set) => set.size === 0)) return [];
  const counts = new Map<string, number>();
  for (const word of sets[0]) {
    if (sets.every((set) => set.has(word))) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.keys()]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, limit);
};

export const groupNameFromWords = (words: string[]): string => {
  if (words.length === 0) return "New group";
  return words
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" · ");
};
