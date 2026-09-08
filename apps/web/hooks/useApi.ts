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

/** Runs a write and reports whether it is in flight. */
export function useAction(): {
  busy: string | null;
  error: string;
  run: (key: string, action: () => Promise<unknown>, after?: () => void) => Promise<void>;
} {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, after?: () => void) => {
      setBusy(key);
      setError("");
      try {
        await action();
        after?.();
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return { busy, error, run };
}
