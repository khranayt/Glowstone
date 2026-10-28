import { api } from "./api";
import {
  basename,
  dirname,
  flattenAllFiles,
  isExternalUrl,
  joinPath,
  normalizePath,
  relPath,
  resolveRef,
} from "./utils";
import type { FileNode, Settings } from "../types";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export const loadAttachment = (path: string): Promise<string | null> => {
  if (cache.has(path)) return Promise.resolve(cache.get(path)!);
  if (pending.has(path)) return pending.get(path)!;
  const promise = api
    .readAttachment(path)
    .then((url) => {
      cache.set(path, url);
      pending.delete(path);
      return url;
    })
    .catch(() => {
      pending.delete(path);
      return null;
    });
  pending.set(path, promise);
  return promise;
};

/** Strip the syntax that can surround an attachment reference. */
export const cleanReference = (reference: string): string => {
  let clean = reference.trim();
  if (clean.startsWith("![[") && clean.endsWith("]]")) clean = clean.slice(3, -2);
  else if (clean.startsWith("[[") && clean.endsWith("]]")) clean = clean.slice(2, -2);
  if (clean.startsWith("<") && clean.endsWith(">")) clean = clean.slice(1, -1);
  clean = clean.split("|")[0].split("#")[0].split("?")[0].trim();
  try {
    clean = decodeURIComponent(clean);
  } catch {
    /* keep the raw value */
  }
  return clean;
};

/** Resolve an attachment reference to a concrete path inside the vault. */
export const findAttachmentPath = (
  vaultRoot: string,
  notePath: string,
  reference: string,
  tree: FileNode[],
): string | null => {
  const direct = resolveRef(vaultRoot, notePath, reference);
  const files = flattenAllFiles(tree);
  if (direct) {
    const exact = files.find((f) => f.path === direct);
    if (exact) return exact.path;
  }
  const clean = cleanReference(reference);
  const name = basename(clean);
  if (!name) return direct;
  const byName = files.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (byName) return byName.path;
  // Try a vault-relative path.
  const rel = normalizePath(clean);
  const vaultRel = joinPath(vaultRoot, rel);
  const found = files.find((f) => f.path === vaultRel);
  return found?.path ?? direct;
};

export const attachmentUrl = async (
  vaultRoot: string,
  notePath: string,
  reference: string,
  tree: FileNode[],
): Promise<string | null> => {
  if (isExternalUrl(reference)) return reference;
  if (reference.startsWith("data:")) return reference;
  const path = findAttachmentPath(vaultRoot, notePath, reference, tree);
  if (!path) return null;
  return loadAttachment(path);
};

/** Vault-relative folder where new attachments for this note should live. */
export const attachmentFolderFor = (
  vaultRoot: string,
  notePath: string,
  settings: Settings,
): string => {
  const fallback = settings.attachmentFolder.trim().replace(/^\/+|\/+$/g, "") || "attachments";
  const noteDir = dirname(notePath);
  const noteRel = noteDir === vaultRoot ? "" : relPath(vaultRoot, noteDir);
  switch (settings.attachmentLocation) {
    case "root":
      return "";
    case "current":
      return noteRel;
    case "subfolder":
      return noteRel ? `${noteRel}/${fallback}` : fallback;
    case "folder":
    default:
      return fallback;
  }
};

/** Relative path from one directory to a file, using forward slashes. */
export const relativePath = (fromDir: string, target: string): string => {
  const from = normalizePath(fromDir).split("/").filter(Boolean);
  const to = normalizePath(target).split("/").filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) {
    shared += 1;
  }
  const up = from.length - shared;
  const rest = to.slice(shared);
  if (up === 0) return rest.join("/") || basename(target);
  return [...Array.from({ length: up }, () => ".."), ...rest].join("/");
};

/** Markdown that points at an attachment from the note it is inserted into. */
export const attachmentMarkdown = (
  vaultRoot: string,
  notePath: string,
  savedPath: string,
  alt?: string,
): string => {
  const relative = relativePath(dirname(notePath), savedPath);
  const needsBrackets = /[\s()<>]/.test(relative);
  const target = needsBrackets ? `<${relative}>` : relative;
  const label = (alt ?? basename(savedPath)).replace(/[[\]\n]/g, " ").trim();
  return `![${label}](${target})`;
};

export const fileToBase64 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
};
