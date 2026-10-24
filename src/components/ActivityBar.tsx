import { Files, HelpCircle, Search, Settings, Waypoints } from "lucide-react";
import { useAppStore } from "../store";
import type { SidebarView } from "../types";

export function ActivityBar() {
  const sidebarView = useAppStore((s) => s.sidebarView);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const openGraphTab = useAppStore((s) => s.openGraphTab);
  const openSettings = useAppStore((s) => s.openSettings);

  const item = (view: SidebarView, icon: React.ReactNode, label: string, shortcut: string) => (
    <button
      className={`ribbon-button ${sidebarOpen && sidebarView === view ? "active" : ""}`}
      onClick={() => setSidebarView(view)}
      title={`${label} (${shortcut})`}
      aria-label={label}
    >
      {icon}
    </button>
  );

  return (
    <nav className="ribbon" aria-label="Sidebar navigation">
      <div className="ribbon-top">
        {item("files", <Files size={19} />, "Files", "Ctrl+Shift+E")}
        {item("search", <Search size={19} />, "Search", "Ctrl+Shift+F")}
        <button
          className="ribbon-button"
          onClick={openGraphTab}
          title="Graph view (Ctrl+Shift+G)"
          aria-label="Graph view"
        >
          <Waypoints size={19} />
        </button>
      </div>
      <div className="ribbon-bottom">
        <button
          className="ribbon-button"
          onClick={() => openSettings("appearance")}
          title="Settings (Ctrl+,)"
          aria-label="Settings"
        >
          <Settings size={19} />
        </button>
        <button
          className="ribbon-button"
          onClick={() => openSettings("about")}
          title="Help & About"
          aria-label="Help"
        >
          <HelpCircle size={19} />
        </button>
      </div>
    </nav>
  );
}
