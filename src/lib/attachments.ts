import { api } from "./api";
import { basename, flattenAllFiles, isExternalUrl, joinPath, normalizePath, resolveRef } from "./utils";
import type { FileNode } from "../types";

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
  const name = basename(reference.split("#")[0].split("?")[0]);
  if (!name) return direct;
  const byName = files.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (byName) return byName.path;
  // Try a vault-relative path.
  const rel = normalizePath(reference.split("#")[0].split("?")[0]);
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
