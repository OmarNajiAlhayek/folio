"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { publicJson } from "@/lib/public-api";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 280;
const SUGGESTION_LIMIT = 10;

export type PublishedAuthorSuggestion = {
  displayName: string;
  publicationCount: number;
};

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
};

export function PublicationAuthorTypeahead({
  id,
  value,
  onChange,
  className,
  inputClassName,
}: Props) {
  const t = useTranslations("Publications");
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PublishedAuthorSuggestion[]>(
    [],
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const fetchSeq = useRef(0);

  const trimmed = value.trim();
  const showList =
    open &&
    trimmed.length >= MIN_QUERY_LENGTH &&
    (loading || suggestions.length > 0);

  const fetchSuggestions = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const sp = new URLSearchParams({ q, limit: String(SUGGESTION_LIMIT) });
      const rows = await publicJson<PublishedAuthorSuggestion[]>(
        `/public/submissions/author-suggestions?${sp.toString()}`,
      );
      if (seq !== fetchSeq.current) return;
      setSuggestions(Array.isArray(rows) ? rows : []);
      setActiveIndex(-1);
    } catch {
      if (seq !== fetchSeq.current) return;
      setSuggestions([]);
    } finally {
      if (seq === fetchSeq.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetchSuggestions(trimmed);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [trimmed, fetchSuggestions]);

  useEffect(() => {
    function onDocPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, []);

  const pickSuggestion = useCallback(
    (name: string) => {
      onChange(name);
      setOpen(false);
      setActiveIndex(-1);
    },
    [onChange],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList && e.key === "ArrowDown" && trimmed.length >= MIN_QUERY_LENGTH) {
      setOpen(true);
      return;
    }
    if (!showList || suggestions.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        i <= 0 ? suggestions.length - 1 : i - 1,
      );
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIndex]!.displayName);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
        }
        autoComplete="off"
        className={inputClassName}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-ink/15 bg-surface py-1 text-sm text-ink shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2 text-ink/50" role="presentation">
              {t("authorSuggestionsLoading")}
            </li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2 text-ink/50" role="presentation">
              {t("authorSuggestionsEmpty")}
            </li>
          ) : (
            suggestions.map((row, index) => (
              <li
                key={`${row.displayName}-${index}`}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-start transition-colors",
                    index === activeIndex
                      ? "bg-accent/10 text-ink"
                      : "hover:bg-ink/5",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(row.displayName)}
                >
                  <span className="truncate" dir="auto">
                    {row.displayName}
                  </span>
                  {row.publicationCount > 1 ? (
                    <span className="shrink-0 text-[10px] font-medium text-ink/45">
                      {t("authorSuggestionsCount", {
                        count: row.publicationCount,
                      })}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
