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
const treeFileCache = new WeakMap<FileNode[], FileNode[]>();

const filesOf = (tree: FileNode[]): FileNode[] => {
  const cached = treeFileCache.get(tree);
  if (cached) return cached;
  const files = flattenAllFiles(tree);
  treeFileCache.set(tree, files);
  return files;
};

export const loadAttachment = (path: string, vaultRoot: string): Promise<string | null> => {
  if (cache.has(path)) return Promise.resolve(cache.get(path)!);
  if (pending.has(path)) return pending.get(path)!;
  const promise = api
    .readAttachment(vaultRoot, path)
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
  const files = filesOf(tree);
  if (direct) {
    const exact = files.find((f) => f.path === direct);
    if (exact) return exact.path;
  }
  // A literal file name may itself contain `#` or `?`; try it before treating
  // those characters as fragment/query syntax.
  const decoded = (() => {
    const trimmed = reference.trim().replace(/^<|>$/g, "");
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();
  const rawName = basename(decoded);
  if (rawName) {
    const byRawName = files.find(
      (f) => f.name.toLowerCase() === rawName.toLowerCase(),
    );
    if (byRawName) return byRawName.path;
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
  return loadAttachment(path, vaultRoot);
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

const IMAGE_EXTENSIONS = /^(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * A safe, descriptive file name for a pasted or dropped image. Clipboard
 * images often arrive as "blob" or without any extension, which makes them
 * impossible to recognise later, so infer one from the MIME type.
 */
export const attachmentNameFor = (file: File): string => {
  const raw = (file.name ?? "").trim();
  const match = /\.([a-z0-9]{1,8})$/i.exec(raw);
  const extension = match?.[1] ?? "";
  const base = extension ? raw.slice(0, -(extension.length + 1)).trim() : raw;
  const mimeExtension = MIME_EXTENSIONS[(file.type || "").toLowerCase()];
  if (extension && IMAGE_EXTENSIONS.test(extension) && base) return raw;

  const finalExtension = mimeExtension ?? (extension || "png");
  if (base && base.toLowerCase() !== "blob" && base.toLowerCase() !== "image") {
    return `${base}.${finalExtension}`;
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours(),
  )}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  return `Pasted image ${stamp}.${finalExtension}`;
};

export interface SizedReference {
  reference: string;
  width?: number;
  height?: number;
}

const ATTACHMENT_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|pdf|mp3|wav|ogg|m4a|flac|mp4|webm|mov|mkv|zip|7z|rar|txt|csv|docx?|xlsx?|pptx?|epub)$/i;

/** Whether a link looks like a file in the vault rather than a note. */
export const looksLikeAttachment = (reference: string) => {
  const clean = reference.split("|")[0].split("#")[0].split("?")[0].trim();
  return ATTACHMENT_EXTENSIONS.test(clean);
};

/** Split Obsidian's `|300` / `|300x200` display size from an embed target. */
export const splitReferenceSize = (value: string): SizedReference => {
  const match = /\|(\d+)(?:x(\d+))?\s*$/.exec(value);
  if (!match) return { reference: value };
  return {
    reference: value.slice(0, match.index),
    width: Number(match[1]) || undefined,
    height: match[2] ? Number(match[2]) || undefined : undefined,
  };
};
