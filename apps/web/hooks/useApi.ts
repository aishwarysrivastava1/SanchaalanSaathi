"use client";

import { useCallback, useEffect, useState } from "react";
import { friendlyError } from "../lib/ngo-api";
import { useNGOAuth } from "../lib/ngo-auth";

/**
 * Fetch-on-mount with loading, error and refetch.
 *
 * Every page was hand-rolling the same three useState calls plus a useEffect.
 * `fetcher` receives the auth token and is re-run whenever `deps` change.
 */
export function useApi<T>(
  fetcher: (token: string) => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: string; reload: () => void } {
  const { user } = useNGOAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    if (!user?.token) return;
    setLoading(true);
    setError("");
    fetcher(user.token)
      .then(setData)
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
    // `fetcher` is redefined on every render, so the caller's deps decide when
    // to refetch. Including it here would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token, ...deps]);

  useEffect(reload, [reload]);

  return { data, loading, error, reload };
}
