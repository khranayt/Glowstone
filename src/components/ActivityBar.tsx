import {
  CalendarDays,
  Files,
  HelpCircle,
  Search,
  Settings,
  Star,
  Table2,
  TerminalSquare,
  Waypoints,
  Frame,
} from "lucide-react";
import { useAppStore } from "../store";
import { useT } from "../lib/useT";
import { pluginEnabled } from "../lib/plugins";
import type { SidebarView } from "../types";

export function ActivityBar() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const sidebarView = useAppStore((s) => s.sidebarView);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const openGraphTab = useAppStore((s) => s.openGraphTab);
  const openSettings = useAppStore((s) => s.openSettings);
  const openPalette = useAppStore((s) => s.openPalette);
  const openDailyNote = useAppStore((s) => s.openDailyNote);
  const createCanvas = useAppStore((s) => s.createCanvas);
  const createBase = useAppStore((s) => s.createBase);

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
    <nav className="ribbon" aria-label={t("Sidebar navigation")}>
      <div className="ribbon-top">
        {item("files", <Files size={19} />, t("Files"), "Ctrl+Shift+E")}
        {item("search", <Search size={19} />, t("Search notes"), "Ctrl+Shift+F")}
        {pluginEnabled(settings, "bookmarks") &&
          item("bookmarks", <Star size={19} />, t("Bookmarks"), "Ctrl+Shift+B")}
        {pluginEnabled(settings, "graph") && (
          <button
            className="ribbon-button"
            onClick={openGraphTab}
            title={`${t("Graph view")} (Ctrl+Shift+G)`}
            aria-label={t("Graph view")}
          >
            <Waypoints size={19} />
          </button>
        )}
        {pluginEnabled(settings, "canvas") && (
          <button
            className="ribbon-button"
            onClick={() => void createCanvas()}
            title={t("New canvas")}
            aria-label={t("New canvas")}
          >
            <Frame size={19} />
          </button>
        )}
        {pluginEnabled(settings, "daily-notes") && (
          <button
            className="ribbon-button"
            onClick={() => void openDailyNote()}
            title={t("Open today's daily note")}
            aria-label={t("Daily note")}
          >
            <CalendarDays size={19} />
          </button>
        )}
        {pluginEnabled(settings, "command-palette") && (
          <button
            className="ribbon-button"
            onClick={openPalette}
            title={`${t("Command palette")} (Ctrl+P)`}
            aria-label={t("Command palette")}
          >
            <TerminalSquare size={19} />
          </button>
        )}
        {pluginEnabled(settings, "bases") && (
          <button
            className="ribbon-button"
            onClick={() => void createBase()}
            title={t("Create database")}
            aria-label={t("Bases")}
          >
            <Table2 size={19} />
          </button>
        )}
      </div>
      <div className="ribbon-bottom">
        <button
          className="ribbon-button"
          onClick={() => openSettings("general")}
          title={`${t("Settings")} (Ctrl+,)`}
          aria-label={t("Settings")}
        >
          <Settings size={19} />
        </button>
        <button
          className="ribbon-button"
          onClick={() => openSettings("about")}
          title={t("Help")}
          aria-label={t("Help")}
        >
          <HelpCircle size={19} />
        </button>
      </div>
    </nav>
  );
}
