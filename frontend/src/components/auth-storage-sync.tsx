"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";

const AUTH_CHANNEL = "folio-auth";

/** Sync logout across tabs when another tab signs out. */
export function AuthStorageSync() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const bc = new BroadcastChannel(AUTH_CHANNEL);
    bc.onmessage = (event: MessageEvent<string>) => {
      if (event.data !== "logout") return;
      queryClient.clear();
      router.push("/login");
      router.refresh();
    };
    return () => bc.close();
  }, [queryClient, router]);

  return null;
}

export function broadcastAuthLogout(): void {
  if (typeof BroadcastChannel === "undefined") return;
  new BroadcastChannel(AUTH_CHANNEL).postMessage("logout");
}
