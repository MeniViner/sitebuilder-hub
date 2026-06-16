export type ParsedSemver = { major: number; minor: number; patch: number };
export type ReleaseType = "patch" | "minor" | "major" | "hotfix";

export function parseSemver(version: string): ParsedSemver | null {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

export function semverToString(value: ParsedSemver): string {
  return `${value.major}.${value.minor}.${value.patch}`;
}

export function bumpPatch(version: string): string {
  return bumpVersion(version, "patch");
}

export function bumpVersion(version: string, releaseType: ReleaseType = "patch"): string {
  const parsed = parseSemver(version);
  if (!parsed) {
    throw new Error(`גרסה לא תקינה: ${version}`);
  }

  if (releaseType === "major") {
    return semverToString({ major: parsed.major + 1, minor: 0, patch: 0 });
  }

  if (releaseType === "minor") {
    return semverToString({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
  }

  return semverToString({ ...parsed, patch: parsed.patch + 1 });
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);

  if (!pa || !pb) return a.localeCompare(b);

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}
