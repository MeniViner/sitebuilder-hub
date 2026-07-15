import { describe, expect, it } from "vitest";
import {
  PRODUCT_SCENARIOS,
  PRODUCT_SCENARIO_NOW,
  getProductScenario,
  scenarioSiteById
} from "../client/src/dev/productScenarios";
import {
  canMutate,
  isSiteSetupComplete,
  presentBackupRecoverability,
  presentOperationState,
  presentOperationTitle,
  presentSiteCondition,
  presentVisibleRole
} from "../client/src/domain/presentation";

describe("deterministic product scenarios", () => {
  it("covers Admin, Viewer, and malformed roles with a fail-closed rule", () => {
    expect(presentVisibleRole(PRODUCT_SCENARIOS.admin.authRole)).toBe("admin");
    expect(presentVisibleRole(PRODUCT_SCENARIOS.viewer.authRole)).toBe("viewer");
    expect(presentVisibleRole(PRODUCT_SCENARIOS["unknown-role"].authRole)).toBe("viewer");
    expect(canMutate(PRODUCT_SCENARIOS["unknown-role"].authRole)).toBe(false);
  });

  it("covers every required site condition without using siteCode as lookup identity", () => {
    const expected = {
      "managed-ready": "ready",
      "managed-attention": "needs-attention",
      "managed-unavailable": "unavailable",
      "managed-partial": "needs-attention",
      "managed-storage-unknown": "needs-attention",
      "managed-runtime-down": "unavailable",
      "managed-health-stale": "needs-attention",
      "managed-outdated": "needs-attention",
      "managed-updating": "needs-attention"
    } as const;
    for (const [managedSiteId, state] of Object.entries(expected)) {
      const site = scenarioSiteById(PRODUCT_SCENARIOS.admin, managedSiteId);
      expect(site?._id).toBe(managedSiteId);
      expect(presentSiteCondition(site || {}, { now: PRODUCT_SCENARIO_NOW }).state).toBe(state);
    }
    expect(scenarioSiteById(PRODUCT_SCENARIOS.admin, "ready-portal")).toBeNull();
  });

  it("covers empty, running, successful, failed, retrying, browser-required, and partial operations", () => {
    expect(PRODUCT_SCENARIOS.empty.jobs).toHaveLength(0);
    const states = new Map(PRODUCT_SCENARIOS.admin.jobs.map((job) => [job._id, presentOperationState(job.status).state]));
    expect(states.get("job-running")).toBe("in-progress");
    expect(states.get("job-backup-running")).toBe("in-progress");
    expect(states.get("job-retrying")).toBe("in-progress");
    expect(states.get("job-browser-required")).toBe("in-progress");
    expect(states.get("job-partial")).toBe("in-progress");
    expect(states.get("job-succeeded")).toBe("succeeded");
    expect(states.get("job-failed")).toBe("failed");
    expect(states.get("job-restore-partial-failed")).toBe("failed");
    expect(presentOperationTitle("internal_collection_reconcile")).toBe("פעולה באתר");
  });

  it("covers every backup evidence and restore state without overstating recoverability", () => {
    const backups = new Map(PRODUCT_SCENARIOS.admin.backups.map((backup) => [backup._id, backup]));
    expect(PRODUCT_SCENARIOS.empty.backups).toHaveLength(0);
    expect(presentBackupRecoverability(backups.get("backup-evidence")).recoverable).toBe(false);
    expect(presentBackupRecoverability(backups.get("backup-payload-unverified")).recoverable).toBe(false);
    expect(presentBackupRecoverability(backups.get("backup-verified"))).toMatchObject({ recoverable: true, label: "גיבוי ניתן לשחזור" });
    expect(presentBackupRecoverability(backups.get("backup-failed"))).toMatchObject({ recoverable: false, label: "הגיבוי נכשל" });
    expect(backups.get("backup-restore-running")?.restoreStatus).toBe("running");
    expect(backups.get("backup-restore-failed")?.restoreStatus).toBe("failed");
  });

  it("defines all live, partial-failure, timeout, cached, and no-data transport cases", () => {
    expect(PRODUCT_SCENARIOS.admin.failures).toBeUndefined();
    expect(PRODUCT_SCENARIOS["backups-fail"].failures?.siteBackups?.mode).toBe("error");
    expect(PRODUCT_SCENARIOS["access-fail"].failures?.access?.mode).toBe("error");
    expect(PRODUCT_SCENARIOS["activity-fail"].failures?.activity?.mode).toBe("error");
    expect(PRODUCT_SCENARIOS["secondary-timeout"].failures?.deployments?.mode).toBe("timeout");
    expect(PRODUCT_SCENARIOS.cached.failures?.siteBackups?.afterSuccesses).toBe(2);
    expect(Object.keys(PRODUCT_SCENARIOS["no-data"].failures || {})).toEqual(expect.arrayContaining(["sites", "site", "activity"]));
  });

  it("defines partial, failed, and fully complete setup outcomes", () => {
    expect(PRODUCT_SCENARIOS["partial-setup"].createOutcome).toBe("partial");
    expect(PRODUCT_SCENARIOS["failed-setup"].createOutcome).toBe("failed");
    expect(PRODUCT_SCENARIOS["complete-setup"].createOutcome).toBe("complete");
    const partial = scenarioSiteById(PRODUCT_SCENARIOS["partial-setup"], "managed-partial");
    expect(isSiteSetupComplete(partial || {}, { now: PRODUCT_SCENARIO_NOW })).toBe(false);
    expect(isSiteSetupComplete(scenarioSiteById(PRODUCT_SCENARIOS.admin, "managed-ready") || {}, { now: PRODUCT_SCENARIO_NOW })).toBe(true);
  });

  it("rejects unknown scenario names", () => {
    expect(getProductScenario("admin")?.id).toBe("admin");
    expect(getProductScenario("not-a-scenario")).toBeNull();
  });
});
