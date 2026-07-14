import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSafeReadGuardsForTests,
  isEvidenceStale,
  markSafeReadAttempted,
  readTimestampMs,
  SAFE_READ_TTL_MS,
  shouldAutoRunSafeRead
} from "../client/src/hooks/useAutoSafeRead";

describe("auto safe-read guards", () => {
  beforeEach(() => {
    clearSafeReadGuardsForTests();
  });

  it("treats missing or stale evidence as refreshable and fresh evidence as current", () => {
    const now = new Date("2026-07-02T10:00:00.000Z").getTime();

    expect(readTimestampMs("2026-07-02T09:59:30.000Z")).toBe(new Date("2026-07-02T09:59:30.000Z").getTime());
    expect(readTimestampMs("not-a-date")).toBe(0);
    expect(isEvidenceStale(undefined, SAFE_READ_TTL_MS.hubHealth, now)).toBe(true);
    expect(isEvidenceStale("2026-07-02T09:59:30.000Z", SAFE_READ_TTL_MS.hubHealth, now)).toBe(false);
    expect(isEvidenceStale("2026-07-02T09:58:00.000Z", SAFE_READ_TTL_MS.hubHealth, now)).toBe(true);
  });

  it("auto-runs once per guard key and skips disabled or in-flight reads", () => {
    const now = new Date("2026-07-02T10:00:00.000Z").getTime();
    const input = {
      guardKey: "site-1:health",
      checkedAt: "2026-07-02T09:00:00.000Z",
      ttlMs: SAFE_READ_TTL_MS.siteEvidence,
      now
    };

    expect(shouldAutoRunSafeRead(input)).toBe(true);
    markSafeReadAttempted(input.guardKey);
    expect(shouldAutoRunSafeRead(input)).toBe(false);
    expect(shouldAutoRunSafeRead({ ...input, guardKey: "site-1:runtime", enabled: false })).toBe(false);
    expect(shouldAutoRunSafeRead({ ...input, guardKey: "site-1:runtime", inFlight: true })).toBe(false);
    expect(shouldAutoRunSafeRead({ ...input, guardKey: "site-1:runtime", checkedAt: "2026-07-02T09:55:00.000Z" })).toBe(false);
  });
});
