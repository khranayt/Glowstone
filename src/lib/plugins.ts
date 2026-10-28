import type { Settings } from "../types";

export interface CorePlugin {
  id: string;
  label: string;
  description: string;
  enabledByDefault?: boolean;
}

export const CORE_PLUGINS: CorePlugin[] = [
  {
    id: "quick-switcher",
    label: "Quick switcher",
    description: "Jump to a note without leaving the keyboard.",
  },
  {
    id: "file-recovery",
    label: "File recovery",
    description: "Restore recent edits from automatic snapshots.",
  },
  {
    id: "daily-notes",
    label: "Daily notes",
    description: "Open or create a note for today.",
  },
  {
    id: "note-composer",
    label: "Note composer",
    description: "Merge notes or extract text into a new note.",
  },
  {
    id: "backlinks",
    label: "Backlinks",
    description: "See which notes link to the current one.",
  },
  {
    id: "command-palette",
    label: "Command palette",
    description: "Run any command from a searchable list.",
  },
  {
    id: "page-preview",
    label: "Page preview",
    description: "Preview notes by hovering internal links.",
  },
  {
    id: "sync",
    label: "Sync",
    description: "Keep your vault in sync across devices.",
  },
  {
    id: "canvas",
    label: "Canvas",
    description: "Arrange notes and ideas on an infinite board.",
  },
  {
    id: "bases",
    label: "Bases",
    description: "Turn notes into tables and databases.",
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    description: "Keep important notes and folders close at hand.",
  },
  {
    id: "graph",
    label: "Graph view",
    description: "Explore the connections between your notes.",
  },
  {
    id: "templates",
    label: "Templates",
    description: "Insert reusable snippets into your notes.",
  },
];

export const pluginEnabled = (settings: Settings, id: string) =>
  !settings.disabledPlugins.includes(id);

export const togglePlugin = (settings: Settings, id: string): string[] =>
  settings.disabledPlugins.includes(id)
    ? settings.disabledPlugins.filter((plugin) => plugin !== id)
    : [...settings.disabledPlugins, id];
