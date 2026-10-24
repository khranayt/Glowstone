import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Check, Info, X, AlertCircle } from "lucide-react";
import { useAppStore } from "../store";
import { Modal } from "./Modal";

export function ConfirmDialog() {
  const confirm = useAppStore((s) => s.confirm);
  const setConfirm = useAppStore((s) => s.setConfirm);

  if (!confirm) return null;

  return (
    <Modal
      open
      onClose={() => setConfirm(null)}
      title={confirm.title}
      width={430}
      className="dialog-modal"
    >
      <p className="dialog-message">{confirm.message}</p>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={() => setConfirm(null)}>
          {confirm.cancelLabel ?? "Cancel"}
        </button>
        <button
          className={`btn ${confirm.danger ? "btn-danger" : "btn-primary"}`}
          onClick={() => {
            const action = confirm.onConfirm;
            setConfirm(null);
            void Promise.resolve(action()).catch(() => undefined);
          }}
        >
          {confirm.confirmLabel ?? "Confirm"}
        </button>
      </div>
    </Modal>
  );
}

function PromptInner({ prompt }: { prompt: NonNullable<ReturnType<typeof useAppStore.getState>["prompt"]> }) {
  const setPrompt = useAppStore((s) => s.setPrompt);
  const [value, setValue] = useState(prompt.initial ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setPrompt(null);
    try {
      await prompt.onSubmit(trimmed);
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={() => setPrompt(null)} title={prompt.title} width={430} className="dialog-modal">
      <label className="prompt-label" htmlFor="prompt-input">
        {prompt.label}
      </label>
      <input
        id="prompt-input"
        ref={inputRef}
        className="prompt-input"
        value={value}
        placeholder={prompt.placeholder}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={() => setPrompt(null)}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void submit()} disabled={!value.trim() || busy}>
          {prompt.confirmLabel ?? "Create"}
        </button>
      </div>
    </Modal>
  );
}

export function PromptDialog() {
  const prompt = useAppStore((s) => s.prompt);
  if (!prompt) return null;
  return <PromptInner prompt={prompt} />;
}

export function ContextMenu() {
  const menu = useAppStore((s) => s.contextMenu);
  const setContextMenu = useAppStore((s) => s.setContextMenu);
  const ref = useRef<HTMLDivElement | null>(null);

  const position = useMemo(() => {
    if (!menu) return { left: 0, top: 0 };
    const width = 250;
    const height = Math.min(menu.items.length * 33 + 12, 480);
    return {
      left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menu, setContextMenu]);

  if (!menu) return null;

  return (
    <div
      className="context-menu"
      ref={ref}
      style={{ left: position.left, top: position.top }}
      onMouseDown={(event) => event.stopPropagation()}
      role="menu"
    >
      {menu.items.map((item, index) =>
        item.separator ? (
          <div className="menu-separator" key={`sep-${index}`} />
        ) : (
          <button
            key={`${item.label}-${index}`}
            className={`menu-item ${item.danger ? "menu-danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              setContextMenu(null);
              void item.action?.();
            }}
            onMouseDown={(event: MouseEvent) => event.stopPropagation()}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}

export function ToastStack() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <span className="toast-icon">
            {toast.kind === "error" ? (
              <AlertCircle size={15} />
            ) : toast.kind === "success" ? (
              <Check size={15} />
            ) : (
              <Info size={15} />
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
