import { useEffect, useMemo, useRef, useState } from "react";
import { CaseSensitive, Search, X } from "lucide-react";
import { useAppStore } from "../store";
import { relPath } from "../lib/utils";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Highlighted({ text, query, caseSensitive }: { text: string; query: string; caseSensitive: boolean }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, caseSensitive ? "g" : "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() && part ? (
          <mark key={index}>{part}</mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function SearchPanel() {
  const query = useAppStore((s) => s.searchQuery);
  const setQuery = useAppStore((s) => s.setSearchQuery);
  const results = useAppStore((s) => s.searchResults);
  const loading = useAppStore((s) => s.searchLoading);
  const caseSensitive = useAppStore((s) => s.searchCaseSensitive);
  const setCaseSensitive = useAppStore((s) => s.setSearchCaseSensitive);
  const runSearch = useAppStore((s) => s.runSearch);
  const openNote = useAppStore((s) => s.openNote);
  const vault = useAppStore((s) => s.vault);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, caseSensitive, runSearch]);

  const totalMatches = useMemo(
    () => results.reduce((count, file) => count + file.matches.length, 0),
    [results],
  );

  const clear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div className="search-panel">
      <div className="search-input-wrap">
        <Search size={15} />
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes…"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results.length > 0) {
              void openNote(results[0].path, { line: results[0].matches[0]?.line });
            }
          }}
        />
        {query && (
          <button className="search-clear" onClick={clear} title="Clear search" aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="search-toolbar">
        <button
          className={`search-option ${caseSensitive ? "active" : ""}`}
          onClick={() => setCaseSensitive(!caseSensitive)}
          title="Match case"
          aria-label="Match case"
        >
          <CaseSensitive size={16} />
        </button>
        <span className="search-summary">
          {query.trim()
            ? loading
              ? "Searching…"
              : `${totalMatches} ${totalMatches === 1 ? "match" : "matches"} in ${results.length} ${
                  results.length === 1 ? "note" : "notes"
                }`
            : ""}
        </span>
      </div>

      <div className="search-results">
        {!query.trim() && (
          <div className="sidebar-placeholder">
            <Search size={26} />
            <p>Search across every note in your vault.</p>
            <p className="hint">Press Ctrl+Shift+F from anywhere to open this panel.</p>
          </div>
        )}

        {query.trim() && !loading && results.length === 0 && (
          <div className="sidebar-placeholder">
            <Search size={26} />
            <p>No results found.</p>
            <p className="hint">Try a different word or turn off “Match case”.</p>
          </div>
        )}

        {results.map((file) => {
          const isCollapsed = collapsed[file.path];
          const rel = vault ? relPath(vault.path, file.path) : file.path;
          const folder = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
          return (
            <div className="search-group" key={file.path}>
              <button
                className="search-group-title"
                onClick={() => setCollapsed((state) => ({ ...state, [file.path]: !state[file.path] }))}
                title={rel}
              >
                <span className="search-group-name">{file.title}</span>
                <span className="search-group-count">{file.matches.length}</span>
              </button>
              {folder && <div className="search-group-folder">{folder}</div>}
              {!isCollapsed &&
                file.matches.map((match) => (
                  <button
                    key={`${file.path}-${match.line}`}
                    className="search-result"
                    onClick={() => void openNote(file.path, { line: match.line })}
                    title={`Line ${match.line}`}
                  >
                    <span className="search-result-line">{match.line}</span>
                    <span className="search-result-text">
                      <Highlighted text={match.text.trim()} query={query} caseSensitive={caseSensitive} />
                    </span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
