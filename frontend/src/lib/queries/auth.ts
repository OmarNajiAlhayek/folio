"use client";

import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { MeProfile } from "@/lib/permissions";

export function useMe(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiJson<MeProfile>("/auth/me"),
    enabled,
    retry: false,
  });
}
