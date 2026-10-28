import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { useAppStore } from "../store";
import { flattenNotes, fuzzyFilter } from "../lib/utils";

const MAX_SUGGESTIONS = 8;

/** Suggest vault notes while the user types a `[[wikilink`. */
export const wikiLinkCompletion: CompletionSource = (context: CompletionContext) => {
  const before = context.matchBefore(/\[\[[^[\]\n]*$/);
  if (!before) return null;

  const tree = useAppStore.getState().tree;
  const notes = flattenNotes(tree);
  if (notes.length === 0) return null;

  const query = before.text.slice(2);
  const matches = fuzzyFilter(notes, query, (note) => `${note.title} ${note.folder}`).slice(
    0,
    MAX_SUGGESTIONS,
  );
  if (matches.length === 0) return null;

  // Titles are usually unique. When they are not, insert a path so the link
  // always points at the note the user picked.
  const counts = new Map<string, number>();
  for (const note of notes) {
    counts.set(note.title, (counts.get(note.title) ?? 0) + 1);
  }

  return {
    from: before.from + 2,
    validFor: /^[^[\]\n]*$/,
    options: matches.map((note) => {
      const duplicate = (counts.get(note.title) ?? 0) > 1;
      const target =
        duplicate && note.folder ? `${note.folder}/${note.title}` : note.title;
      return {
        label: note.title,
        detail: note.folder || undefined,
        apply: `${target}]]`,
        type: "text",
      };
    }),
  } satisfies CompletionResult;
};

export const wikiLinkAutocomplete = autocompletion({
  override: [wikiLinkCompletion],
  activateOnTyping: true,
  closeOnBlur: true,
  maxRenderedOptions: MAX_SUGGESTIONS,
  icons: false,
});
