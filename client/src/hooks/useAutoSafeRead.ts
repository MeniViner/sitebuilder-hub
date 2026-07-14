import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const SAFE_READ_TTL_MS = {
  hubHealth: 60 * 1000,
  browserSharePointDiagnostics: 10 * 60 * 1000,
  siteEvidence: 15 * 60 * 1000,
  builderMongoHealth: 10 * 60 * 1000,
  deployDryRun: 5 * 60 * 1000
} as const;

const sessionGuard = new Set<string>();

export const readTimestampMs = (value: unknown) => {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const isEvidenceStale = (checkedAt: unknown, ttlMs: number, now = Date.now()) => {
  const checkedAtMs = readTimestampMs(checkedAt);
  if (!checkedAtMs) return true;
  return now - checkedAtMs > ttlMs;
};

export const shouldAutoRunSafeRead = ({
  guardKey,
  checkedAt,
  ttlMs,
  enabled = true,
  inFlight = false,
  now = Date.now()
}: {
  guardKey: string;
  checkedAt?: unknown;
  ttlMs: number;
  enabled?: boolean;
  inFlight?: boolean;
  now?: number;
}) => {
  if (!enabled || !guardKey || inFlight) return false;
  if (sessionGuard.has(guardKey)) return false;
  return isEvidenceStale(checkedAt, ttlMs, now);
};

export const markSafeReadAttempted = (guardKey: string) => {
  if (guardKey) sessionGuard.add(guardKey);
};

export const clearSafeReadGuardsForTests = () => {
  sessionGuard.clear();
};

export function useAutoSafeRead({
  guardKey,
  checkedAt,
  ttlMs,
  enabled = true,
  inFlight = false,
  run,
  onError
}: {
  guardKey: string;
  checkedAt?: unknown;
  ttlMs: number;
  enabled?: boolean;
  inFlight?: boolean;
  run: () => Promise<unknown>;
  onError?: (message: string) => void;
}) {
  useEffect(() => {
    if (!shouldAutoRunSafeRead({ guardKey, checkedAt, ttlMs, enabled, inFlight })) return;
    markSafeReadAttempted(guardKey);
    run().catch((error) => {
      onError?.(error instanceof Error ? error.message : String(error));
    });
  }, [checkedAt, enabled, guardKey, inFlight, onError, run, ttlMs]);
}

export function useStaleEvidenceResource<T>({
  initialData = null,
  checkedAt,
  ttlMs,
  load
}: {
  initialData?: T | null;
  checkedAt?: unknown;
  ttlMs: number;
  load: () => Promise<T>;
}) {
  const [data, setData] = useState<T | null>(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const latestSuccessAtRef = useRef(readTimestampMs(checkedAt));
  const stale = useMemo(() => isEvidenceStale(checkedAt || latestSuccessAtRef.current, ttlMs), [checkedAt, ttlMs]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const next = await load();
      setData(next);
      latestSuccessAtRef.current = Date.now();
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return {
    data,
    setData,
    refreshing,
    error,
    stale,
    refresh,
    lastSuccessAt: latestSuccessAtRef.current ? new Date(latestSuccessAtRef.current).toISOString() : ""
  };
}
