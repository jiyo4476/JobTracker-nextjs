"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { IdentityScopeProvider } from "@/lib/identity-scope";

/**
 * API-013: every personal read (/api/stats, /api/jobs, /api/activity, …) is scoped
 * to the resolved caller and served `private, no-store`. To make sure one user's
 * personal cached data can never flash for the next identity, we purge the entire
 * React Query cache whenever any query crosses the auth boundary:
 *   - 401 Unauthorized  → session expired / logged out
 *   - 403 Forbidden     → resolved account deactivated (inactive_user)
 * After such a response the forward-auth proxy re-challenges on the next
 * navigation, so clearing here guarantees no stale personal data survives the
 * identity change.
 */
function isAuthBoundaryError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      queryCache: new QueryCache({
        onError: (error) => {
          if (isAuthBoundaryError(error)) client.clear();
        },
      }),
      defaultOptions: { queries: { staleTime: 30_000 } },
    });
    return client;
  });
  return (
    <QueryClientProvider client={queryClient}>
      <IdentityScopeProvider>{children}</IdentityScopeProvider>
    </QueryClientProvider>
  );
}
