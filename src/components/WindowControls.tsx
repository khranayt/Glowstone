import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isAndroid, isTauri } from "../lib/api";
import { useT } from "../lib/useT";

export function WindowControls() {
  if (isAndroid()) return null;
  const t = useT();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized).catch(() => undefined);
    void win.onResized(() => {
      void win.isMaximized().then(setMaximized).catch(() => undefined);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const minimize = () => {
    if (!isTauri()) return;
    void getCurrentWindow().minimize();
  };
  const toggleMaximize = () => {
    if (!isTauri()) return;
    void getCurrentWindow().toggleMaximize();
  };
  const close = () => {
    if (!isTauri()) return;
    void getCurrentWindow().close();
  };

  return (
    <div className="window-controls">
      <button className="window-control" onClick={minimize} title={t("Minimize")} aria-label={t("Minimize")}>
        <Minus size={15} />
      </button>
      <button
        className="window-control"
        onClick={toggleMaximize}
        title={maximized ? t("Restore") : t("Maximize")}
        aria-label={t("Maximize")}
      >
        <Square size={maximized ? 12 : 13} />
      </button>
      <button className="window-control window-close" onClick={close} title={t("Close window")} aria-label={t("Close window")}>
        <X size={16} />
      </button>
    </div>
  );
}
