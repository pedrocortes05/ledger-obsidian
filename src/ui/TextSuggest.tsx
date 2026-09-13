import Fuse from 'fuse.js';
import React from 'react';
import { usePopper } from 'react-popper';

/**
 * searchSuggestions returns the best matches for the query. Suggestions are
 * expected to be ranked (most recently used first), which is kept for ties
 * and for an empty query.
 */
export const searchSuggestions = (
  fuse: Fuse<string>,
  suggestions: string[],
  query: string,
  limit: number,
): string[] => {
  const trimmed = query.trim();
  if (trimmed === '') {
    return suggestions.slice(0, limit);
  }
  const lower = trimmed.toLowerCase();
  // Substring matches first (keeps "oxxo" finding "COMPRA EN OXXO ARBOLEDA"),
  // then fuzzy matches.
  const substring = suggestions.filter((s) => s.toLowerCase().includes(lower));
  const fuzzy = fuse
    .search(trimmed, { limit: limit * 2 })
    .map((result) => result.item)
    .filter((s) => !substring.includes(s));
  return [...substring, ...fuzzy].slice(0, limit);
};

export const makeFuse = (suggestions: string[]): Fuse<string> =>
  new Fuse(suggestions, { threshold: 0.4, ignoreLocation: true });

export const TextSuggest: React.FC<{
  value: string;
  onChange: (value: string) => void;
  /** Called when a suggestion is chosen (click or Enter). */
  onSelect?: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  limit?: number;
  className?: string;
}> = (props): JSX.Element => {
  const limit = props.limit ?? 15;
  const fuse = React.useMemo(
    () => makeFuse(props.suggestions),
    [props.suggestions],
  );
  const [visible, setVisible] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);

  const results = React.useMemo(
    () => searchSuggestions(fuse, props.suggestions, props.value, limit),
    [fuse, props.suggestions, props.value, limit],
  );

  const [referenceElement, setReferenceElement] =
    React.useState<HTMLInputElement | null>(null);
  const [popperElement, setPopperElement] = React.useState<HTMLElement | null>(
    null,
  );
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: 'bottom-start',
  });

  const choose = (value: string): void => {
    props.onChange(value);
    props.onSelect?.(value);
    setVisible(false);
    setSelectedIndex(-1);
  };

  const showList =
    visible &&
    results.length > 0 &&
    !(results.length === 1 && results[0] === props.value);

  return (
    <>
      <input
        ref={setReferenceElement}
        className={props.className}
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        autoComplete="off"
        onChange={(e) => {
          props.onChange(e.target.value);
          setVisible(true);
          setSelectedIndex(-1);
        }}
        onFocus={() => {
          setVisible(true);
          setSelectedIndex(-1);
        }}
        onBlur={() => {
          setVisible(false);
          const exact = props.suggestions.find(
            (s) => s.toLowerCase() === props.value.trim().toLowerCase(),
          );
          if (exact !== undefined && props.value.trim() !== '') {
            choose(exact);
          }
        }}
        onKeyDown={(e) => {
          switch (e.key) {
            case 'ArrowDown':
              setVisible(true);
              setSelectedIndex(Math.min(selectedIndex + 1, results.length - 1));
              e.preventDefault();
              return;
            case 'ArrowUp':
              setSelectedIndex(Math.max(selectedIndex - 1, -1));
              e.preventDefault();
              return;
            case 'Enter':
              e.preventDefault();
              if (
                showList &&
                selectedIndex >= 0 &&
                selectedIndex < results.length
              ) {
                choose(results[selectedIndex]);
              } else {
                // Keep what was typed, even if nothing matches.
                setVisible(false);
              }
              return;
            case 'Escape':
              if (showList) {
                e.preventDefault();
                e.stopPropagation();
                setVisible(false);
              }
              return;
          }
        }}
      />

      {showList ? (
        <div
          className="suggestion-container ledger-suggestion-container"
          ref={setPopperElement}
          style={styles.popper}
          {...attributes.popper}
        >
          {results.map((s, i) => (
            <div
              key={s}
              className={
                'suggestion-item' + (i === selectedIndex ? ' is-selected' : '')
              }
              onMouseDown={(e) => {
                // Keep focus in the input so blur does not fire first.
                e.preventDefault();
                choose(s);
              }}
              onMouseOver={() => setSelectedIndex(i)}
            >
              {s}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
};
