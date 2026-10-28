import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  FolderOpen,
  Globe,
  Loader2,
  Notebook,
  ShieldCheck,
  Waypoints,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Modal } from "./Modal";
import { useAppStore } from "../store";
import { basename, dirname } from "../lib/utils";
import type { ImportKind, ImportResult } from "../types";
import { useT } from "../lib/useT";
import { plural, t as translate } from "../lib/i18n";

interface FormatInfo {
  kind: ImportKind;
  title: string;
  description: string;
  target: "folder" | "file";
  icon: React.ReactNode;
}

const formats: FormatInfo[] = [
  {
    kind: "obsidian",
    title: "Obsidian vault",
    description: "Keep notes, folders and attachments. Obsidian settings are skipped.",
    target: "folder",
    icon: <Database size={17} />,
  },
  {
    kind: "logseq",
    title: "Logseq graph",
    description: "Bring in pages and journals. Logseq's internal folders are ignored.",
    target: "folder",
    icon: <Waypoints size={17} />,
  },
  {
    kind: "markdown",
    title: "Markdown folder",
    description: "Copy a folder of Markdown files and its attachments as-is.",
    target: "folder",
    icon: <FolderOpen size={17} />,
  },
  {
    kind: "text",
    title: "Plain text folder",
    description: "Convert .txt files to Markdown notes while keeping the folder tree.",
    target: "folder",
    icon: <FileText size={17} />,
  },
  {
    kind: "html",
    title: "HTML folder",
    description: "Turn .html and .htm pages into clean Markdown notes.",
    target: "folder",
    icon: <Globe size={17} />,
  },
  {
    kind: "notion",
    title: "Notion export",
    description: "Import an exported folder. HTML pages and CSV databases become notes.",
    target: "folder",
    icon: <Notebook size={17} />,
  },
  {
    kind: "evernote",
    title: "Evernote export",
    description: "Import an .enex export file exported from Evernote.",
    target: "file",
    icon: <Notebook size={17} />,
  },
];

const formatLabel = (kind: ImportKind) =>
  translate(formats.find((format) => format.kind === kind)?.title ?? "Import");

export function ImportModal() {
  const t = useT();
  const open = useAppStore((s) => s.importOpen);
  const close = useAppStore((s) => s.closeImport);
  const importVault = useAppStore((s) => s.importVault);
  const vault = useAppStore((s) => s.vault);
  const [kind, setKind] = useState<ImportKind>("obsidian");
  const [source, setSource] = useState("");
  const [parent, setParent] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const selected = useMemo(
    () => formats.find((format) => format.kind === kind) ?? formats[0],
    [kind],
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setResult(null);
    setBusy(false);
  }, [open]);

  const chooseFormat = (next: ImportKind) => {
    setKind(next);
    setSource("");
    setParent("");
    setName("");
    setError("");
    setResult(null);
  };

  const pickSource = async () => {
    setError("");
    try {
      const picked = await openDialog(
        selected.target === "file"
          ? {
              multiple: false,
              directory: false,
              title: t("Choose {name}", { name: formatLabel(kind) }),
              filters: [{ name: "Evernote export", extensions: ["enex"] }],
            }
          : {
              multiple: false,
              directory: true,
              title: t("Choose {name} folder", { name: formatLabel(kind) }),
            },
      );
      if (typeof picked !== "string" || !picked) return;
      setSource(picked);
      if (!parent) setParent(dirname(picked));
      if (selected.target === "file") {
        setName(basename(picked).replace(/\.enex$/i, ""));
      } else {
        setName(basename(picked));
      }
    } catch (value) {
      setError(t("Could not open the picker: {error}", { error: String(value) }));
    }
  };

  const pickParent = async () => {
    setError("");
    try {
      const picked = await openDialog({
        multiple: false,
        directory: true,
        title: t("Choose where to create the imported vault"),
      });
      if (typeof picked === "string" && picked) setParent(picked);
    } catch (value) {
      setError(t("Could not open the picker: {error}", { error: String(value) }));
    }
  };

  const runImport = async () => {
    if (!source) {
      setError(t("Choose a source first."));
      return;
    }
    if (!parent) {
      setError(t("Choose where the new vault should be created."));
      return;
    }
    if (!name.trim()) {
      setError(t("Give the imported vault a name."));
      return;
    }
    setBusy(true);
    setError("");
    const imported = await importVault(kind, source, parent, name.trim());
    setBusy(false);
    if (imported) setResult(imported);
  };

  const reset = () => {
    setKind("obsidian");
    setSource("");
    setParent("");
    setName("");
    setError("");
    setResult(null);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    close();
  };

  const resultTitle = result
    ? `${t("Imported {n} notes", { n: result.imported })}`
    : "";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={vault ? t("Import notes") : t("Import your notes")}
      width={820}
      className="import-modal"
    >
      {result ? (
        <div className="import-success">
          <span className="import-success-icon">
            <CheckCircle2 size={30} />
          </span>
          <h3>{resultTitle}</h3>
          <p>
            {t("Your notes are ready in")} <strong>{basename(result.path)}</strong>
            {result.skipped > 0 ? ` · ${t("{n} items skipped", { n: result.skipped })}` : ""}.
          </p>
          <div className="import-success-path">{result.path}</div>
          <div className="import-success-actions">
            <button className="btn btn-secondary" onClick={reset}>
              {t("Import something else")}
            </button>
            <button className="btn btn-primary" onClick={handleClose}>
              {t("Done")}
            </button>
          </div>
        </div>
      ) : (
        <div className="import-layout">
          <aside className="import-formats">
            <div className="import-formats-label">{t("Import from")}</div>
            {formats.map((format) => (
              <button
                key={format.kind}
                className={`import-format ${kind === format.kind ? "selected" : ""}`}
                onClick={() => chooseFormat(format.kind)}
              >
                <span className="import-format-icon">{format.icon}</span>
                <span className="import-format-copy">
                  <span className="import-format-title">{t(format.title)}</span>
                  <span className="import-format-description">{t(format.description)}</span>
                </span>
              </button>
            ))}
          </aside>

          <section className="import-form">
            <div className="import-form-heading">
              <div>
                <h3>{t(selected.title)}</h3>
                <p>{t(selected.description)}</p>
              </div>
            </div>

            <div className="import-field">
              <label>{selected.target === "file" ? t("Export file") : t("Source folder")}</label>
              <div className="import-path-row">
                <input value={source} readOnly placeholder={t("Nothing selected")} spellCheck={false} />
                <button className="btn btn-secondary" onClick={() => void pickSource()}>
                  {t("Browse…")}
                </button>
              </div>
            </div>

            <div className="import-field">
              <label>{t("Create vault in")}</label>
              <div className="import-path-row">
                <input value={parent} readOnly placeholder={t("Choose a destination folder")} spellCheck={false} />
                <button className="btn btn-secondary" onClick={() => void pickParent()}>
                  {t("Browse…")}
                </button>
              </div>
            </div>

            <div className="import-field">
              <label>{t("Vault name")}</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("My imported vault")}
                spellCheck={false}
              />
            </div>

            {error && <div className="import-error">{error}</div>}

            <div className="import-tip">
              <ShieldCheck size={15} />
              <span>
                {t("Your original files are never moved or changed. Glowstone creates a fresh copy in the destination you choose.")}
              </span>
            </div>

            <div className="import-actions">
              <button className="btn btn-secondary" onClick={handleClose} disabled={busy}>
                {t("Cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void runImport()}
                disabled={busy || !source || !parent || !name.trim()}
              >
                {busy ? <Loader2 size={15} className="spin" /> : <ArrowRight size={15} />}
                {busy ? t("Importing…") : t("Import vault")}
              </button>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
