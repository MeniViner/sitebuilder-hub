import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  buildSiteProvisionPlan: vi.fn(),
  executeSiteProvisioning: vi.fn(),
  buildPermissionsSetupPlan: vi.fn(),
  executePermissionsSetup: vi.fn(),
  ensureSharePointSiteCollection: vi.fn(),
  getSharePointOperationCapabilities: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/services/siteProvisioning.service", () => ({
  buildSiteProvisionPlan: mocks.buildSiteProvisionPlan,
  executeSiteProvisioning: mocks.executeSiteProvisioning
}));
vi.mock("../server/src/services/permissionsSetup.service", () => ({
  buildPermissionsSetupPlan: mocks.buildPermissionsSetupPlan,
  executePermissionsSetup: mocks.executePermissionsSetup
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  ensureSharePointSiteCollection: mocks.ensureSharePointSiteCollection,
  getSharePointOperationCapabilities: mocks.getSharePointOperationCapabilities
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const makeSite = (overrides: Record<string, unknown> = {}) => ({
  _id: idOf("site-1"),
  siteCode: "alpha",
  displayName: "Alpha Site",
  description: "Alpha description",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  siteDbLibrary: "siteDB",
  usersDbLibrary: "siteUsersDb",
  bootstrapLibrary: "SiteAssets",
  bootstrapFolder: "sitebuilder-bootstrap",
  widgetsDbTarget: "users",
  ownerEmail: "owner@example.test",
  status: "draft",
  save: vi.fn(),
  ...overrides
});

const writeCapabilities = {
  readAvailable: true,
  writeEnabled: true,
  hasAuthMaterial: true,
  unauthenticatedWriteAllowed: false,
  writeAvailable: true,
  authMode: "bearer",
  authModes: ["bearer"],
  requestTimeoutMs: 15000,
  digest: {
    requiredForWrites: true,
    endpointSuffix: "/_api/contextinfo",
    canRequest: true
  },
  siteCreation: {
    modernSiteCollectionEndpoint: "/_api/SPSiteManager/create",
    statusEndpoint: "/_api/SPSiteManager/status",
    canCreate: true,
    pollAttempts: 2,
    pollIntervalMs: 1
  }
};

beforeEach(() => {
  mocks.Site.findById.mockReset();
  mocks.buildSiteProvisionPlan.mockReset();
  mocks.executeSiteProvisioning.mockReset();
  mocks.buildPermissionsSetupPlan.mockReset();
  mocks.executePermissionsSetup.mockReset();
  mocks.ensureSharePointSiteCollection.mockReset();
  mocks.getSharePointOperationCapabilities.mockReset();
  mocks.getSharePointOperationCapabilities.mockReturnValue(writeCapabilities);
  mocks.buildSiteProvisionPlan.mockResolvedValue({
    steps: [
      { key: "library-site-db", label: "Ensure siteDB Document Library", target: "siteDB" }
    ]
  });
  mocks.buildPermissionsSetupPlan.mockResolvedValue({
    steps: [
      { key: "write-marker", label: "Write permissions marker", target: "/sites/alpha/siteUsersDb/.permissions-setup.json" }
    ]
  });
});

describe("SharePoint site bootstrap planning", () => {
  it("builds a full create/provision/permissions plan with owner defaults from the site", async () => {
    mocks.Site.findById.mockResolvedValue(makeSite());

    const { buildSiteBootstrapPlan } = await import("../server/src/services/siteBootstrap.service");
    const plan = await buildSiteBootstrapPlan("site-1");

    expect(plan).toMatchObject({
      operation: "site-bootstrap",
      siteId: "site-1",
      siteCode: "alpha",
      targetWeb: {
        sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
        siteRoot: "/sites/alpha",
        creationMode: "site-collection",
        owner: "owner@example.test",
        webTemplate: "STS#3",
        lcid: 1033
      },
      summary: {
        createsSharePointSite: true,
        runsProvisioning: true,
        runsPermissionsSetup: true,
        readyForBootstrapExecution: true
      },
      blockers: []
    });
    expect(plan.steps.map((step) => step.phase)).toEqual([
      "site-create",
      "site-create",
      "site-create",
      "provision",
      "permissions"
    ]);
  });

  it("blocks execution readiness when a site owner is missing", async () => {
    mocks.Site.findById.mockResolvedValue(makeSite({ ownerEmail: "" }));

    const { buildSiteBootstrapPlan } = await import("../server/src/services/siteBootstrap.service");
    const plan = await buildSiteBootstrapPlan("site-1", { runPermissionsSetup: false });

    expect(plan.summary).toMatchObject({
      runsPermissionsSetup: false,
      readyForBootstrapExecution: false
    });
    expect(plan.blockers).toContain("sharepoint-site-owner-missing");
    expect(mocks.buildPermissionsSetupPlan).not.toHaveBeenCalled();
  });
});

describe("SharePoint site bootstrap execution", () => {
  it("creates or reuses the site collection, provisions structure, configures permissions, and activates draft site records", async () => {
    const site = makeSite();
    const saved = makeSite();
    mocks.Site.findById.mockResolvedValueOnce(site).mockResolvedValueOnce(saved);
    mocks.ensureSharePointSiteCollection.mockResolvedValue({
      action: "created",
      targetUrl: "https://portal.army.idf/sites/alpha",
      statusBefore: { statusName: "not-found" },
      statusAfter: { statusName: "ready" },
      polls: [{ statusName: "ready" }]
    });
    mocks.executeSiteProvisioning.mockResolvedValue({
      completedSteps: [
        { key: "library-site-db", label: "Ensure siteDB Document Library", target: "siteDB" }
      ]
    });
    mocks.executePermissionsSetup.mockResolvedValue({
      completedSteps: [
        { key: "write-marker", label: "Write permissions marker", target: "/sites/alpha/siteUsersDb/.permissions-setup.json" }
      ]
    });

    const { executeSiteBootstrap } = await import("../server/src/services/siteBootstrap.service");
    const result = await executeSiteBootstrap("site-1");

    expect(mocks.ensureSharePointSiteCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        siteCode: "alpha",
        sharePointSiteUrl: "https://portal.army.idf/sites/alpha"
      }),
      expect.objectContaining({
        title: "Alpha Site",
        description: "Alpha description",
        owner: "owner@example.test",
        lcid: 1033,
        webTemplate: "STS#3"
      })
    );
    expect(mocks.executeSiteProvisioning).toHaveBeenCalledWith("site-1");
    expect(mocks.executePermissionsSetup).toHaveBeenCalledWith("site-1");
    expect(saved.status).toBe("active");
    expect(saved.save).toHaveBeenCalled();
    expect(result).toMatchObject({
      siteId: "site-1",
      siteCode: "alpha",
      siteCollection: { action: "created" }
    });
    expect(result.completedSteps.map((step) => step.phase)).toEqual([
      "site-create",
      "site-create",
      "site-create",
      "provision",
      "permissions"
    ]);
  });
});
