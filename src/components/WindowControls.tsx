import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/api";

export function WindowControls() {
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
      <button className="window-control" onClick={minimize} title="Minimize" aria-label="Minimize">
        <Minus size={15} />
      </button>
      <button
        className="window-control"
        onClick={toggleMaximize}
        title={maximized ? "Restore" : "Maximize"}
        aria-label="Maximize"
      >
        <Square size={maximized ? 12 : 13} />
      </button>
      <button className="window-control window-close" onClick={close} title="Close" aria-label="Close">
        <X size={16} />
      </button>
    </div>
  );
}
