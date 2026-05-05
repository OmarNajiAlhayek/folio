"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConstructorContent,
  ConstructorDraftEnvelope,
} from "./constructor-content.types";

const DRAFT_KEY = "folio.constructor-draft.v1";
const CHANNEL_NAME = "folio.constructor-draft";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

/** Returns a fresh document pre-populated with the 6 mandatory pinned sections. */
function initialContent(): ConstructorContent {
  return {
    defaultDir: "ltr",
    sections: [
      { id: newId(), kind: "title",      lang: "en", text: "",              pinned: true, dir: "ltr", dirSource: "auto" },
      { id: newId(), kind: "title",      lang: "ar", text: "",              pinned: true, dir: "rtl", dirSource: "auto" },
      { id: newId(), kind: "authors",    authors: [],                        pinned: true, dir: "ltr", dirSource: "auto" },
      { id: newId(), kind: "abstract",   lang: "en", text: "", keywords: "", pinned: true, dir: "ltr", dirSource: "auto" },
      { id: newId(), kind: "abstract",   lang: "ar", text: "", keywords: "", pinned: true, dir: "rtl", dirSource: "auto" },
      { id: newId(), kind: "references", items: [],                          pinned: true, dir: "ltr", dirSource: "auto" },
    ],
  };
}

/** Read the persisted constructor draft (same shape as `useConstructorDraft`). */
export function readConstructorDraftEnvelope(): ConstructorDraftEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConstructorDraftEnvelope;
    if (!parsed.content || !Array.isArray(parsed.content.sections)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Remove constructor draft from localStorage only (does not reset React state). */
export function clearConstructorDraftStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function writeEnvelope(env: ConstructorDraftEnvelope): {
  ok: boolean;
  quotaExceeded?: boolean;
} {
  if (typeof window === "undefined") return { ok: false };
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(env));
    return { ok: true };
  } catch (e) {
    const isQuota =
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" ||
        // Firefox name
        e.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return { ok: false, quotaExceeded: isQuota };
  }
}

function newTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

interface UseConstructorDraftOptions {
  /**
   * When true (default), this tab participates in BroadcastChannel sync —
   * incoming envelopes from other tabs replace local state if their
   * `lastModified` is newer than ours.
   *
   * Read-only views (e.g. preview-only) should pass `false` so that another
   * tab's edits don't clobber what the user is reading.
   */
  multiTabSync?: boolean;
  /** Initial content if nothing is in storage. */
  initial?: ConstructorContent;
}

interface UseConstructorDraftResult {
  content: ConstructorContent;
  setContent: (next: ConstructorContent) => void;
  clear: () => void;
  /** When true, the most recent write hit storage quota — host UI should warn. */
  quotaExceeded: boolean;
  /** Notification for the host: another tab pushed a newer draft into ours. */
  externalUpdateAt: number | null;
}

/**
 * Pre-slug constructor draft persistence:
 *   - Hydrates from localStorage on mount
 *   - Persists every change (debounced ~250ms)
 *   - Sends/receives `ConstructorDraftEnvelope` over BroadcastChannel for
 *     multi-tab sync (last-write-wins by `lastModified`)
 *   - Surfaces a `quotaExceeded` flag if writing fails (e.g. images saved as
 *     base64 inadvertently — the constructor disallows this, but defensively
 *     we still degrade gracefully).
 *
 * NOTE: This hook intentionally does NOT auto-save to the backend. The word
 * construction is promoted to the server when the author creates a submission
 * from `/submissions/new` (POST then optional PATCH with `constructorContent`);
 * the host may call `clear()` after a successful attach to reset local state.
 */
export function useConstructorDraft(
  options: UseConstructorDraftOptions = {},
): UseConstructorDraftResult {
  const { multiTabSync = true, initial } = options;
  // Stable SSR-safe seed — no crypto.randomUUID() here, avoiding the
  // server/client HTML mismatch. The real initial content (with UUIDs) is
  // applied client-only in the useEffect below.
  const [content, setContentState] = useState<ConstructorContent>(
    () => initial ?? { defaultDir: "ltr", sections: [] },
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [externalUpdateAt, setExternalUpdateAt] = useState<number | null>(null);

  const tabIdRef = useRef<string>("");
  const lastModifiedRef = useRef<string>("1970-01-01T00:00:00.000Z");
  const channelRef = useRef<BroadcastChannel | null>(null);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage once. Client-only setState — it cannot move into
  // useState's initializer because that would run during SSR where
  // `localStorage` is undefined and would also produce an HTML/JSX hydration mismatch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    tabIdRef.current = newTabId();
    const env = readConstructorDraftEnvelope();
    if (env) {
      setContentState(env.content);
      lastModifiedRef.current = env.lastModified;
    } else if (!initial) {
      // No saved draft and no externally-provided content — seed with the
      // pre-populated pinned sections. Done here (client-only) so that
      // crypto.randomUUID() is never called during SSR, which would produce
      // a server/client hydration mismatch.
      setContentState(initialContent());
    }
    if (multiTabSync && typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.onmessage = (ev: MessageEvent<ConstructorDraftEnvelope>) => {
        const incoming = ev.data;
        if (!incoming || incoming.tabId === tabIdRef.current) return;
        if (incoming.lastModified > lastModifiedRef.current) {
          lastModifiedRef.current = incoming.lastModified;
          setContentState(incoming.content);
          setExternalUpdateAt(Date.now());
        }
      };
      channelRef.current = ch;
      return () => {
        ch.close();
        channelRef.current = null;
      };
    }
    return undefined;
    // `initial` is intentionally omitted: re-running when parent identity changes
    // would re-read storage and could clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hydration
  }, [multiTabSync]);

  // Cleanup pending write on unmount
  useEffect(() => {
    return () => {
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
      }
    };
  }, []);

  const setContent = useCallback((next: ConstructorContent) => {
    setContentState(next);
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      const env: ConstructorDraftEnvelope = {
        content: next,
        lastModified: new Date().toISOString(),
        tabId: tabIdRef.current || "anonymous",
      };
      lastModifiedRef.current = env.lastModified;
      const result = writeEnvelope(env);
      setQuotaExceeded(!!result.quotaExceeded);
      if (result.ok && channelRef.current) {
        try {
          channelRef.current.postMessage(env);
        } catch {
          // structured clone might fail on exotic objects — ignore.
        }
      }
    }, 250);
  }, []);

  const clear = useCallback(() => {
    if (writeTimerRef.current) {
      clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
    }
    setContentState(initialContent());
    setQuotaExceeded(false);
  }, []);

  return { content, setContent, clear, quotaExceeded, externalUpdateAt };
}

export const CONSTRUCTOR_DRAFT_STORAGE_KEY = DRAFT_KEY;
