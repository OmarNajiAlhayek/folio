'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ConstructorContent } from '@/lib/constructor-content.types';

const TAB_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function wsBase(): string {
  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5243/api/v1';
  const u = new URL(api);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/api/v1/ws/constructor-collab';
  return u.origin + u.pathname;
}

/**
 * Multi-device constructor sync over WebSocket (author-only room per slug).
 * Complements BroadcastChannel for pre-slug drafts.
 */
export function useConstructorCollab(options: {
  slug?: string;
  enabled?: boolean;
  content: ConstructorContent;
  onRemoteContent: (content: ConstructorContent, lastModified: string) => void;
  onBroadcast?: (content: ConstructorContent) => void;
}) {
  const {
    slug,
    enabled = true,
    content,
    onRemoteContent,
    onBroadcast,
  } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const lastSentRef = useRef<string>('');
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!enabled || !slug || typeof window === 'undefined') return;
    let closed = false;
    const token = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('folio_access='))
      ?.split('=')[1];
    if (!token) return;

    const ws = new WebSocket(`${wsBase()}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          event: 'join',
          data: { slug, tabId: TAB_ID },
        }),
      );
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          content?: ConstructorContent;
          lastModified?: string;
          fromTabId?: string;
        };
        if (msg.type === 'remote-sync' && msg.content && msg.lastModified) {
          if (msg.fromTabId === TAB_ID) return;
          onRemoteContent(msg.content, msg.lastModified);
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      closed = true;
      ws.close();
      wsRef.current = null;
      if (!closed) return;
    };
  }, [enabled, slug, onRemoteContent]);

  const broadcast = useCallback(
    (next: ConstructorContent) => {
      if (!slug) return;
      const lastModified = new Date().toISOString();
      const json = JSON.stringify(next);
      if (json === lastSentRef.current) return;
      lastSentRef.current = json;
      revisionRef.current += 1;
      onBroadcast?.(next);
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            event: 'sync',
            data: {
              type: 'sync',
              slug,
              tabId: TAB_ID,
              revision: revisionRef.current,
              lastModified,
              content: next,
            },
          }),
        );
      }
    },
    [slug, onBroadcast],
  );

  useEffect(() => {
    broadcast(content);
  }, [content, broadcast]);

  return { tabId: TAB_ID };
}
