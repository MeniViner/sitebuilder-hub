import { describe, expect, it } from "vitest";
import { releaseDisplayLabel, releaseOptionLabel } from "../client/src/utils/releaseLabels";

describe("release labels", () => {
  it("keeps the release name visible before the version in selection labels", () => {
    const release = {
      _id: "64f00000000000000000abcd",
      name: "הדרכות יוני",
      version: "1.0.0"
    };

    expect(releaseDisplayLabel(release)).toBe("הדרכות יוני · 1.0.0");
    expect(releaseOptionLabel(release, "mongo + txt")).toBe("הדרכות יוני · 1.0.0 · mongo + txt");
  });

  it("does not hide an explicit name that looks like a release label", () => {
    const release = {
      _id: "64f00000000000000000abcd",
      name: "Release 1.0.0",
      version: "1.0.0"
    };

    expect(releaseDisplayLabel(release)).toBe("Release 1.0.0 · 1.0.0");
  });

  it("adds a short release id when no human name exists", () => {
    const release = {
      _id: "64f00000000000000000abcd",
      version: "1.0.0"
    };

    expect(releaseOptionLabel(release, "mongo + txt")).toBe("Release 1.0.0 · שם חסר · מזהה 0000abcd · mongo + txt");
  });
});
