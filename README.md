# Glowstone

A local-first Markdown knowledge base for the desktop and Android. Glowstone keeps your notes as plain `.md` files in ordinary folders, then layers on tabs, live preview, backlinks, search, and an interactive graph.

Built with Tauri 2, Rust, React 19, TypeScript, and CodeMirror 6. Available in English and Russian.

## Features

- **Plain-file vaults** — open any folder of Markdown files. Nothing is imported or converted.
- **Live preview editor** — CodeMirror 6 with Obsidian-style inline rendering for headings, emphasis, links, images, tables, task lists, callouts, code, and `==highlights==`.
- **Edit and reading modes** — switch with `Ctrl+E`; reading mode renders a clean, typography-first view.
- **Formatting toolbar** — bold, italic, strikethrough, inline code, headings, lists, tasks, quotes, callouts, tables, links, images, highlights, undo/redo, and more. It compacts automatically in narrow panes.
- **Tabs and workspace restore** — reopen the notes, tab order, panel state, and sidebar width you were last using, per vault.
- **File explorer** — create, rename, move, and delete notes and folders, with drag-and-drop and context menus.
- **Search** — full-text search across the vault with line-level results and jump-to-line.
- **Graph view** — a custom force-directed canvas graph of notes and unresolved links, with pan, zoom, drag, hover highlighting, filters, adjustable forces, and a sidebar mini-graph.
- **Backlinks and outline** — see incoming links and jump through the current note's headings.
- **Quick switcher and command palette** — `Ctrl+O` to jump between notes, `Ctrl+P` for commands.
- **Wikilinks, embeds, tags** — `[[Note]]`, `![[Note]]`, `![[image.png]]`, and `#tags` work in edit and reading modes.
- **External change watching** — edits made outside Glowstone are picked up without clobbering unsaved work.
- **Two themes** — dark gray and light, switchable in Settings and remembered.
- **English and Russian** — switch the whole interface from Settings → General.
- **Graph groups** — select notes on the graph and group them by the words they share, with editable dot colors.
- **Bookmarks, daily notes and a ribbon** — Obsidian-style quick actions, plus a searchable settings dialog with core plugin toggles.
- **Bases (`.base`)** — turn notes into filterable, sortable tables driven by YAML views and frontmatter properties.
- **Canvas (`.canvas`)** — JSON Canvas boards with text, note, link and group cards, connections, pan and zoom.
- **Local and private** — no account, no sync service, no telemetry. Settings live in your OS config directory.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Tauri 2 system dependencies for your platform: see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

On Debian/Ubuntu, for example:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Run from source

```bash
npm install
npm run tauri dev
```

### Build a release

```bash
npm run tauri build
```

The packaged app and installers are written to `src-tauri/target/release/bundle/`.

### Platform packages

```bash
# Linux: AppImage, deb and rpm
npm run tauri build -- --bundles appimage,deb,rpm

# Windows: NSIS installer (.exe)
npm run tauri build -- --bundles nsis

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New note |
| `Ctrl+O` | Quick switcher |
| `Ctrl+P` | Command palette |
| `Ctrl+S` | Save note |
| `Ctrl+E` | Toggle edit / reading mode |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+Shift+F` | Search vault |
| `Ctrl+Shift+G` | Open graph tab |
| `Ctrl+Shift+E` | File explorer |
| `Ctrl+,` | Settings |
| `F2` | Rename selected note |
| `Alt+←` / `Alt+→` | Navigate note history |



## Repository layout

```
src/                 React application
  components/        UI: sidebar, tabs, editor shell, graph, dialogs
  editor/            CodeMirror setup, live preview, commands, theme
  lib/               Tauri API wrapper, Markdown renderer, attachments
  styles/            App, editor, Markdown, and graph stylesheets
src-tauri/           Rust backend
  src/lib.rs         Vault scanning, file operations, search, graph, watcher
  vendor/html2md/    Patched HTML→Markdown crate (Android-safe)
  icons/             Application icons
packaging/           Platform build instructions
.github/workflows/   CI: Linux and Windows packages
```

## Building from a checkout on GitHub

1. Create an empty repository on GitHub (no README/license needed).
2. Push this project:

   ```bash
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin master
   ```

3. Run the **Build desktop packages** workflow from the Actions tab (or push a
   `v0.1.0` tag). It uploads the Linux AppImage/deb/rpm and the Windows `.exe` as downloadable artifacts.

Installers is intentionally not committed; `release/` is git-ignored.
Attach them to a GitHub Release instead (`gh release create v0.1.0 release/*`).

## Markdown support

CommonMark plus GitHub-flavored tables, task lists, and strikethrough; fenced code with syntax highlighting; images and attachments; `[[wikilinks]]` and embeds; `#tags`; `==highlights==`; and Obsidian-style callouts (`> [!note]`, `> [!tip]`, `> [!warning]`, and friends).

## Status

Glowstone is an early release. It focuses on the core note-taking loop — vaults, editing, reading, search, links, and graph — and will grow from there.

## License

MIT. See [LICENSE](LICENSE).
