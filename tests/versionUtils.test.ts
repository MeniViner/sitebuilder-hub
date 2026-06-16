import { describe, expect, it } from "vitest";
import { bumpPatch, bumpVersion } from "../server/src/utils/version";

describe("version utilities", () => {
  it("bumps release versions by release type", () => {
    expect(bumpVersion("0.1.20", "patch")).toBe("0.1.21");
    expect(bumpVersion("0.1.20", "hotfix")).toBe("0.1.21");
    expect(bumpVersion("0.1.20", "minor")).toBe("0.2.0");
    expect(bumpVersion("0.1.20", "major")).toBe("1.0.0");
  });

  it("keeps bumpPatch as a patch-version alias", () => {
    expect(bumpPatch("2.3.4")).toBe("2.3.5");
  });
});
