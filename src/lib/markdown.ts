import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import type { Tokens } from "marked";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { attachmentUrl, findAttachmentPath, splitReferenceSize } from "./attachments";
import { flattenAllFiles, isBasePath, isCanvasPath, isExternalUrl, isMarkdownPath } from "./utils";
import { isTauri } from "./api";
import { t } from "./i18n";
import { calloutSvg } from "./calloutIcons";
import type { FileNode } from "../types";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeAttr = escapeHtml;

const embedExtension = {
  name: "glowstoneEmbed",
  level: "inline" as const,
  start(src: string) {
    const index = src.indexOf("![[");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src: string) {
    const match = /^!\[\[([^\]\n]+?)\]\]/.exec(src);
    if (!match) return undefined;
    return { type: "glowstoneEmbed", raw: match[0], target: match[1] };
  },
  renderer(this: unknown, token: Tokens.Generic) {
    const target = String(token.target);
    const isImage = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(target.split("|")[0].trim());
    if (isImage) {
      return `<span class="md-image-embed" data-src="${escapeAttr(target)}"><span class="md-embed-loading">Loading image…</span></span>`;
    }
    const label = target.split("|")[1]?.trim() || target.split("|")[0];
    return `<a class="internal-link md-embed-note" data-href="${escapeAttr(target)}">${escapeHtml(label)}</a>`;
  },
};

const wikilinkExtension = {
  name: "glowstoneWikilink",
  level: "inline" as const,
  start(src: string) {
    const index = src.indexOf("[[");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src: string) {
    const match = /^\[\[([^\]\n]+?)\]\]/.exec(src);
    if (!match) return undefined;
    return {
      type: "glowstoneWikilink",
      raw: match[0],
      target: match[1],
    };
  },
  renderer(this: unknown, token: Tokens.Generic) {
    const target = String(token.target);
    const [rawTarget, alias] = target.split("|");
    const [noteTarget, heading] = rawTarget.split("#");
    const label = (alias ?? noteTarget ?? target).trim();
    return `<a class="internal-link" data-href="${escapeAttr(target)}" data-note="${escapeAttr(noteTarget.trim())}" ${
      heading ? `data-heading="${escapeAttr(heading)}"` : ""
    }>${escapeHtml(label)}</a>`;
  },
};

const tagExtension = {
  name: "glowstoneTag",
  level: "inline" as const,
  start(src: string) {
    const index = src.indexOf("#");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src: string) {
    const match = /^#([A-Za-z0-9_/-]*[A-Za-z][A-Za-z0-9_/-]*)/.exec(src);
    if (!match) return undefined;
    return { type: "glowstoneTag", raw: match[0], tag: match[1] };
  },
  renderer(this: unknown, token: Tokens.Generic) {
    return `<span class="md-tag">#${escapeHtml(String(token.tag))}</span>`;
  },
};

const highlightExtension = {
  name: "glowstoneHighlight",
  level: "inline" as const,
  start(src: string) {
    const index = src.indexOf("==");
    return index >= 0 ? index : undefined;
  },
  tokenizer(
    this: { lexer: { inlineTokens(src: string): Tokens.Generic[] } },
    src: string,
  ) {
    const match = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
    if (!match) return undefined;
    return {
      type: "glowstoneHighlight",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
    };
  },
  renderer(
    this: { parser: { parseInline(tokens: Tokens.Generic[]): string } },
    token: Tokens.Generic,
  ) {
    return `<mark>${this.parser.parseInline(token.tokens as Tokens.Generic[])}</mark>`;
  },
};

const looseImageExtension = {
  name: "glowstoneLooseImage",
  level: "inline" as const,
  start(src: string) {
    const index = src.indexOf("![");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src: string) {
    const head = /^!\[([^\]\n]*)\]\(/.exec(src);
    if (!head) return undefined;
    const start = head[0].length;
    // Already a valid `<...>` destination; let the built-in rule handle it.
    if (src[start] === "<") return undefined;
    let depth = 0;
    let index = start;
    for (; index < src.length && src[index] !== "\n"; index += 1) {
      const char = src[index];
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === "(") depth += 1;
      else if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
    }
    if (src[index] !== ")") return undefined;
    const rawDestination = src.slice(start, index).trim();
    if (!rawDestination) return undefined;
    const quoted = /^(.*?)(?:\s+"([^"]*)"|\s+'([^']*)')$/s.exec(rawDestination);
    const target = (quoted ? quoted[1] : rawDestination).trim();
    if (!target) return undefined;
    // Ordinary destinations belong to the built-in image rule.
    if (!/[\s()<>]/.test(target)) return undefined;
    return {
      type: "glowstoneLooseImage",
      raw: src.slice(0, index + 1),
      text: head[1],
      href: target,
      title: quoted ? quoted[2] ?? quoted[3] : undefined,
    };
  },
  renderer(this: unknown, token: Tokens.Generic) {
    const title = token.title
      ? ` title="${escapeAttr(String(token.title))}"`
      : "";
    return `<img src="${escapeAttr(String(token.href))}" alt="${escapeAttr(
      String(token.text),
    )}"${title}>`;
  },
};

marked.use({
  gfm: true,
  breaks: true,
  extensions: [
    looseImageExtension,
    embedExtension,
    wikilinkExtension,
    tagExtension,
    highlightExtension,
  ],
});

export const renderMarkdown = (content: string): string => {
  const html = marked.parse(content, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "data-href", "data-src", "data-note", "data-heading", "data-callout", "id"],
    ADD_TAGS: ["u", "mark"],
  });
};

interface DecorateOptions {
  content?: string;
  vaultRoot: string;
  notePath: string;
  tree: FileNode[];
  onOpenNote: (target: string) => void;
  onExternal?: (url: string) => void;
}

const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

/** Add links, images, callouts and code-block chrome to rendered markdown. */
export const decorateMarkdown = (
  container: HTMLElement,
  options: DecorateOptions,
) => {
  const { vaultRoot, notePath, tree, onOpenNote, onExternal } = options;

  const resolveAttachment = (target: string) => {
    const path = findAttachmentPath(vaultRoot, notePath, target, tree);
    // findAttachmentPath falls back to a computed path for images that are not
    // indexed yet. For clicks, only open files that really exist in the vault.
    if (!path || !flattenAllFiles(tree).some((file) => file.path === path)) return null;
    return path;
  };

  const openAttachment = (target: string) => {
    const path = resolveAttachment(target);
    if (!path) return false;
    if (isBasePath(path) || isCanvasPath(path)) {
      onOpenNote(target);
      return true;
    }
    if (isTauri()) {
      void openPath(path).catch(() => {
        void attachmentUrl(vaultRoot, notePath, target, tree).then((url) => {
          if (url) window.open(url, "_blank");
        });
      });
    } else {
      void attachmentUrl(vaultRoot, notePath, target, tree).then((url) => {
        if (url) window.open(url, "_blank");
      });
    }
    return true;
  };

  // Code blocks ------------------------------------------------------------
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.parentElement?.classList.contains("md-code-block")) return;
    const code = pre.querySelector("code");
    const wrapper = document.createElement("div");
    wrapper.className = "md-code-block";
    const header = document.createElement("div");
    header.className = "md-code-header";
    const lang = code
      ? [...code.classList].find((c) => c.startsWith("language-"))?.replace("language-", "")
      : "";
    const langLabel = document.createElement("span");
    langLabel.className = "md-code-lang";
    langLabel.textContent = lang || "text";
    const copy = document.createElement("button");
    copy.className = "md-code-copy";
    copy.type = "button";
    copy.innerHTML = `${copyIcon}<span>${t("Copy")}</span>`;
    copy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = code?.textContent ?? "";
      navigator.clipboard.writeText(text).then(
        () => {
          copy.classList.add("copied");
          copy.querySelector("span")!.textContent = t("Copied");
          window.setTimeout(() => {
            copy.classList.remove("copied");
            copy.querySelector("span")!.textContent = t("Copy");
          }, 1400);
        },
        () => undefined,
      );
    });
    header.append(langLabel, copy);
    pre.parentElement?.insertBefore(wrapper, pre);
    wrapper.append(header, pre);

    if (code && code.textContent) {
      try {
        const language = lang && hljs.getLanguage(lang) ? lang : undefined;
        const result = language
          ? hljs.highlight(code.textContent, { language })
          : hljs.highlightAuto(code.textContent);
        code.innerHTML = result.value;
        code.classList.add("hljs");
      } catch {
        /* leave the code unhighlighted */
      }
    }
  });

  // Tables ---------------------------------------------------------------
  container.querySelectorAll("table").forEach((table) => {
    if (table.parentElement?.classList.contains("md-table-wrap")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "md-table-wrap";
    table.parentElement?.insertBefore(wrapper, table);
    wrapper.append(table);
  });

  // Task lists -----------------------------------------------------------
  container.querySelectorAll("li").forEach((item) => {
    const checkbox = item.querySelector<HTMLInputElement>(":scope > input[type='checkbox']");
    if (!checkbox) return;
    item.classList.add("task-list-item");
    if (checkbox.checked) item.classList.add("is-checked");
    const wrapper = document.createElement("span");
    wrapper.className = "task-text";
    let node = checkbox.nextSibling;
    const trailing: Node[] = [];
    while (node) {
      const next = node.nextSibling;
      if (node.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test((node as Element).tagName)) {
        break;
      }
      trailing.push(node);
      node = next;
    }
    if (trailing.length) {
      trailing.forEach((child) => wrapper.append(child));
      checkbox.after(wrapper);
    }
  });

  // Callouts -------------------------------------------------------------
  container.querySelectorAll("blockquote").forEach((quote) => {
    if (quote.classList.contains("md-callout")) return;
    const first = quote.querySelector("p");
    if (!first) return;
    // The marker and the title live on the first visual line of the quote,
    // which marked separates with a <br>. Reading textContent would join the
    // title with the body, so measure up to that break instead.
    const br = first.querySelector("br");
    const titleRange = document.createRange();
    titleRange.setStart(first, 0);
    if (br) titleRange.setEndBefore(br);
    else titleRange.setEnd(first, first.childNodes.length);
    const titleText = titleRange.toString();
    const match = /^\s*\[!([A-Za-z-]+)\][+-]?\s*([\s\S]*)$/.exec(titleText);
    if (!match) return;
    const type = match[1].toLowerCase();
    const title = match[2].trim() || type.charAt(0).toUpperCase() + type.slice(1);
    if (br) {
      while (first.firstChild && first.firstChild !== br) first.removeChild(first.firstChild);
      first.removeChild(br);
      const leading = first.firstChild;
      if (leading && leading.nodeType === Node.TEXT_NODE) {
        leading.textContent = (leading.textContent ?? "").replace(/^\s+/, "");
      }
      if (!(first.textContent ?? "").trim() && !first.querySelector("img, code, a, strong")) {
        first.remove();
      }
    } else {
      first.remove();
    }
    const heading = document.createElement("div");
    heading.className = "md-callout-title";
    heading.innerHTML = calloutSvg(type);
    const label = document.createElement("span");
    label.textContent = title;
    heading.append(label);
    quote.insertBefore(heading, quote.firstChild);
    quote.classList.add("md-callout");
    quote.dataset.callout = type;
  });

  // Images ---------------------------------------------------------------
  const hydrateImage = (image: HTMLImageElement, reference: string) => {
    image.classList.add("md-image-loading");
    void attachmentUrl(vaultRoot, notePath, reference, tree).then((url) => {
      image.classList.remove("md-image-loading");
      if (!url) {
        image.classList.add("md-image-error");
        image.alt = image.alt || t("Could not load {name}", { name: reference });
        return;
      }
      image.src = url;
    });
  };

  container.querySelectorAll<HTMLElement>(".md-image-embed").forEach((embed) => {
    const { reference, width, height } = splitReferenceSize(embed.dataset.src ?? "");
    const image = document.createElement("img");
    image.className = "md-embedded-image";
    image.alt = reference;
    image.draggable = false;
    if (width) image.style.width = `${width}px`;
    if (height) image.style.height = `${height}px`;
    embed.textContent = "";
    embed.append(image);
    hydrateImage(image, reference);
  });

  container.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    if (image.closest(".md-image-embed")) return;
    const src = image.getAttribute("src") ?? "";
    if (!src) return;
    if (!isExternalUrl(src)) {
      hydrateImage(image, src);
    } else {
      image.loading = "lazy";
    }
  });

  // Links ----------------------------------------------------------------
  container.querySelectorAll<HTMLAnchorElement>("a").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    if (anchor.classList.contains("internal-link")) {
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        const target = anchor.dataset.href ?? "";
        const clean = target.split("|")[0].split("#")[0].trim();
        if (clean && !isMarkdownPath(clean) && openAttachment(target)) return;
        onOpenNote(target);
      });
      return;
    }
    if (anchor.dataset.href) {
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        onOpenNote(anchor.dataset.href ?? "");
      });
      return;
    }
    if (href.startsWith("#")) {
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        const target = container.querySelector<HTMLElement>(
          `#${CSS.escape(decodeURIComponent(href.slice(1)))}`,
        );
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    if (isExternalUrl(href)) {
      anchor.target = "_blank";
      anchor.rel = "noreferrer noopener";
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        if (onExternal) onExternal(href);
        else void openUrl(href).catch(() => undefined);
      });
      return;
    }
    // Relative links to other notes.
    const decoded = decodeURIComponent(href.split("#")[0]);
    if (isMarkdownPath(decoded) || !/\.[a-z0-9]{1,6}$/i.test(decoded)) {
      anchor.classList.add("internal-link");
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        onOpenNote(href);
      });
      return;
    }
    const attachment = resolveAttachment(href);
    if (attachment) {
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        openAttachment(href);
      });
    }
  });
};

export const sanitizeFileName = (name: string) =>
  name.replace(/[\\/:*?"<>|]/g, "").trim();
