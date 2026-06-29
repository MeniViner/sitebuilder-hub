export type UserRole = "viewer" | "operator" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
  personalNumber?: string;
  source?: "dev" | "api-key" | "owner" | "bootstrap" | "site-admin" | "sharepoint";
  loginName?: string;
  email?: string;
  identityMode?: "sharepoint-user" | "explicit-owner" | "local-fallback" | "api-key";
  isBootstrapAdmin?: boolean;
  ownerMode?: boolean;
  ownerModeReason?: string;
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthUser;
    }
  }
}

export {};
