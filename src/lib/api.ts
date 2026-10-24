import { invoke } from "@tauri-apps/api/core";
import type {
  FileNode,
  GraphData,
  SearchFile,
  Settings,
  VaultInfo,
} from "../types";

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api = {
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  addRecentFile: (path: string) => invoke<void>("add_recent_file", { path }),
  openVault: (path: string) => invoke<VaultInfo>("open_vault", { path }),
  closeVault: () => invoke<void>("close_vault"),
  stats: (vault: string) => invoke<VaultInfo>("stats", { vault }),
  listTree: (vault: string) => invoke<FileNode[]>("list_tree", { vault }),
  readFile: (path: string) => invoke<string>("read_file", { path }),
  writeFile: (path: string, content: string) =>
    invoke<void>("write_file", { path, content }),
  createNote: (parent: string, name: string) =>
    invoke<string>("create_note", { parent, name }),
  createFolder: (parent: string, name: string) =>
    invoke<string>("create_folder", { parent, name }),
  renameEntry: (path: string, newName: string) =>
    invoke<string>("rename_entry", { path, newName }),
  moveEntry: (path: string, targetDir: string) =>
    invoke<string>("move_entry", { path, targetDir }),
  deleteEntry: (path: string) => invoke<void>("delete_entry", { path }),
  fileExists: (path: string) => invoke<boolean>("file_exists", { path }),
  readAttachment: (path: string) =>
    invoke<string>("read_attachment", { path }),
  searchVault: (vault: string, query: string, caseSensitive: boolean) =>
    invoke<SearchFile[]>("search_vault", { vault, query, caseSensitive }),
  getGraph: (vault: string) => invoke<GraphData>("get_graph", { vault }),
};
