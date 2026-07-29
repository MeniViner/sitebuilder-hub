import { describe, expect, it } from "vitest";
import {
  PILOT_GATEWAY_SITE_ID,
  loadPilotGatewayConfig
} from "../server/src/config/pilotGateway";

const enabledEnv = (overrides: Record<string, string | undefined> = {}) => ({
  SITE_BUILDER_PILOT_GATEWAY_ENABLED: "true",
  SITE_BUILDER_PILOT_GATEWAY_PREFIX: "/builder-api",
  SITE_BUILDER_PILOT_GATEWAY_TARGET: "http://127.0.0.1:3001",
  SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS: PILOT_GATEWAY_SITE_ID,
  SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS: "https://portal.army.idf",
  SITE_BUILDER_PILOT_GATEWAY_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY",
  SITE_BUILDER_BACKEND_API_KEY: "synthetic-test-secret",
  ...overrides
});

describe("PILOT_ONLY Builder Gateway configuration", () => {
  it("is disabled by default and does not inherit the normal Builder connector", () => {
    const config = loadPilotGatewayConfig({
      SITE_BUILDER_BACKEND_API_URLS: "http://127.0.0.1:3001",
      SITE_BUILDER_DEFAULT_BACKEND_API_URL: "http://127.0.0.1:3001",
      SITE_BUILDER_BACKEND_API_KEY: "normal-connector-secret"
    });

    expect(config.enabled).toBe(false);
    expect(config.target).toBeNull();
    expect(config.apiKey).toBe("");
  });

  it("loads the exact pilot contract when explicitly enabled", () => {
    const config = loadPilotGatewayConfig(enabledEnv());

    expect(config.enabled).toBe(true);
    expect(config.prefix).toBe("/builder-api");
    expect(config.target?.origin).toBe("http://127.0.0.1:3001");
    expect(Array.from(config.allowedSiteIds)).toEqual([PILOT_GATEWAY_SITE_ID]);
    expect(Array.from(config.allowedOrigins)).toEqual(["https://portal.army.idf"]);
    expect(config.apiKeyRef).toBe("SITE_BUILDER_BACKEND_API_KEY");
  });

  it.each([
    ["a missing target", { SITE_BUILDER_PILOT_GATEWAY_TARGET: undefined }, "TARGET is required"],
    ["a non-loopback target", { SITE_BUILDER_PILOT_GATEWAY_TARGET: "https://attacker.example" }, "fixed loopback"],
    ["a target path", { SITE_BUILDER_PILOT_GATEWAY_TARGET: "http://127.0.0.1:3001/other" }, "fixed loopback"],
    ["a missing secret reference", { SITE_BUILDER_PILOT_GATEWAY_API_KEY_REF: undefined }, "API_KEY_REF is required"],
    ["a missing resolved secret", { SITE_BUILDER_BACKEND_API_KEY: undefined }, "referenced"],
    ["an invalid prefix", { SITE_BUILDER_PILOT_GATEWAY_PREFIX: "/builder-api/../admin" }, "safe absolute path"],
    ["an empty site list", { SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS: undefined }, "ALLOWED_SITE_IDS is required"],
    ["another allowed site", { SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS: "alphateam" }, PILOT_GATEWAY_SITE_ID],
    ["multiple allowed sites", { SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS: `${PILOT_GATEWAY_SITE_ID},other` }, PILOT_GATEWAY_SITE_ID],
    ["an empty origin list", { SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS: undefined }, "ALLOWED_ORIGINS is required"],
    ["a wildcard origin", { SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS: "*" }, "wildcards"],
    ["an origin path", { SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS: "https://portal.army.idf/sites/alpha" }, "exact HTTP(S) origins"]
  ])("rejects %s", (_label, overrides, expected) => {
    expect(() => loadPilotGatewayConfig(enabledEnv(overrides))).toThrow(expected);
  });
});
