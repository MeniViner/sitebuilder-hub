import { describe, expect, it } from "vitest";
import {
  isEnvironmentTemplate,
  isRealEnvironmentFile
} from "../scripts/validate-offline-package.mjs";

describe("offline package environment classification", () => {
  it("rejects real environment files and secret-bearing variants", () => {
    for (const file of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.development",
      ".env.test",
      "server/.env",
      "client/runtime.env.production"
    ]) {
      expect(isRealEnvironmentFile(file), file).toBe(true);
    }
  });

  it("preserves environment examples and templates", () => {
    for (const file of [
      ".env.example",
      ".env.local.example",
      ".env.production.example",
      "server/.env.example",
      "client/CONFIGURATION.env.example",
      ".env.template"
    ]) {
      expect(isEnvironmentTemplate(file), file).toBe(true);
      expect(isRealEnvironmentFile(file), file).toBe(false);
    }
  });
});
