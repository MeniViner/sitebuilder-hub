import { env, ownerDirectModeEnabled } from "../config/env";
import type { AuthUser } from "../types/express";

const normalizePersonalNumber = (value?: string) => {
  const match = String(value || "").trim().match(/s?\d{6,8}/i);
  if (!match) return "";
  const digits = match[0].replace(/\D/g, "");
  return digits ? `s${digits}` : "";
};

export type OwnerModeResolution = {
  ownerMode: boolean;
  ownerModeReason: string;
};

export function resolveAuthOwnerMode(user?: AuthUser | null): OwnerModeResolution {
  if (!user) {
    return {
      ownerMode: false,
      ownerModeReason: "לא נמצא משתמש מחובר בבקשת auth/me."
    };
  }

  if (user.ownerMode === true) {
    return {
      ownerMode: true,
      ownerModeReason: "ownerMode הוגדר במפורש על משתמש האימות."
    };
  }

  if (user.source === "owner") {
    return {
      ownerMode: true,
      ownerModeReason: "מקור האימות הוא owner."
    };
  }

  if (user.identityMode === "explicit-owner") {
    return {
      ownerMode: true,
      ownerModeReason: "identityMode הוא explicit-owner."
    };
  }

  const ownerPersonalNumber = normalizePersonalNumber(env.HUB_OWNER_PERSONAL_NUMBER);
  const userPersonalNumber = normalizePersonalNumber(user.personalNumber);
  if (ownerPersonalNumber && userPersonalNumber && ownerPersonalNumber === userPersonalNumber) {
    return {
      ownerMode: true,
      ownerModeReason: "המספר האישי תואם ל־HUB_OWNER_PERSONAL_NUMBER."
    };
  }

  if (ownerDirectModeEnabled() && (user.source === "dev" || user.identityMode === "local-fallback")) {
    return {
      ownerMode: true,
      ownerModeReason: "Local-dev owner-direct mode פעיל."
    };
  }

  return {
    ownerMode: false,
    ownerModeReason: "המשתמש מחובר, אבל אינו מזוהה כבעלים: source אינו owner, identityMode אינו explicit-owner, והמספר האישי אינו תואם ל־HUB_OWNER_PERSONAL_NUMBER."
  };
}

export function withOwnerMode(user?: AuthUser | null): AuthUser | null {
  if (!user) return null;
  const resolution = resolveAuthOwnerMode(user);
  return {
    ...user,
    ownerMode: resolution.ownerMode,
    ownerModeReason: resolution.ownerModeReason
  };
}
