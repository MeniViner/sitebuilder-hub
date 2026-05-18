export type UserRole = "viewer" | "operator" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
  personalNumber?: string;
  source?: "dev" | "api-key" | "hardcoded" | "bootstrap" | "site-admin";
  isBootstrapAdmin?: boolean;
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
