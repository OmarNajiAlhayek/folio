"use client";

import { useQuery } from "@tanstack/react-query";
import { apiJson, getStoredToken } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { MeProfile } from "@/lib/permissions";

export function useMe(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiJson<MeProfile>("/auth/me"),
    enabled: enabled && !!getStoredToken(),
  });
}
