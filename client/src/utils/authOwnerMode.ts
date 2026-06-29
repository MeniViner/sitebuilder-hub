import type { WhoAmIResult } from "../api/sitesApi";

export type AuthOwnerModeInput = NonNullable<WhoAmIResult["user"]> | null | undefined;

export type ClientOwnerModeResolution = {
  ownerMode: boolean;
  ownerModeReason: string;
};

export function deriveClientOwnerMode(authUser: AuthOwnerModeInput): ClientOwnerModeResolution {
  if (!authUser) {
    return {
      ownerMode: false,
      ownerModeReason: "לא נמצא משתמש מחובר. יש להתחבר עם מספר אישי של בעל HUB או משתמש מורשה."
    };
  }

  if (authUser.ownerMode === true) {
    return {
      ownerMode: true,
      ownerModeReason: authUser.ownerModeReason || "ownerMode=true התקבל מהשרת."
    };
  }

  if (authUser.source === "owner") {
    return {
      ownerMode: true,
      ownerModeReason: "מקור האימות הוא owner."
    };
  }

  if (authUser.identityMode === "explicit-owner") {
    return {
      ownerMode: true,
      ownerModeReason: "identityMode הוא explicit-owner."
    };
  }

  return {
    ownerMode: false,
    ownerModeReason: "המשתמש מחובר אך אינו מזוהה כבעלים. נדרש ownerMode=true מהשרת, source=owner או identityMode=explicit-owner."
  };
}
