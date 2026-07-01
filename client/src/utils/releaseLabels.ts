import type { Release } from "../api/sitesApi";

type ReleaseLabelInput = Pick<Release, "name" | "version"> & Partial<Pick<Release, "_id">>;

export function releaseName(release?: Pick<Release, "name" | "version"> | null) {
  return String(release?.name || "").trim();
}

function shortReleaseId(release?: Partial<Pick<Release, "_id">> | null) {
  const id = String(release?._id || "").trim();
  return id.length > 8 ? id.slice(-8) : id;
}

export function releaseDisplayLabel(release?: ReleaseLabelInput | null) {
  if (!release) return "Release לא נבחר";
  const name = releaseName(release);
  const version = String(release.version || "").trim();
  if (!name) return version ? `Release ${version}` : "Release ללא זיהוי";
  if (!version || name === version) return name;
  return `${name} · ${version}`;
}

export function releaseOptionLabel(release: ReleaseLabelInput, suffix?: string) {
  const name = releaseName(release);
  const id = shortReleaseId(release);
  const releaseLabel = releaseDisplayLabel(release);
  const missingNameLabel = !name ? "שם חסר" : "";
  const identityFallback = !name && id ? `מזהה ${id}` : "";
  return [releaseLabel, missingNameLabel, identityFallback, suffix].filter(Boolean).join(" · ");
}
