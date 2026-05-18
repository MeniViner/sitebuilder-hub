import { z } from "zod";

export const adminIdentitySchema = z.object({
  displayName: z.string().optional(),
  personalNumber: z.string().optional(),
  email: z.string().optional(),
  loginName: z.string().optional(),
  source: z.enum(["txt", "siteCollection", "ownersGroup"]).optional().default("txt")
});

export const addAdminSchema = z.object({
  admin: adminIdentitySchema
});

export const removeAdminSchema = z.object({
  source: z.enum(["txt", "siteCollection", "ownersGroup"]).optional()
});

export const syncAdminsSchema = z.object({
  mode: z.enum(["read-only", "sync"]).optional().default("sync")
});

export const adminTxtRepairSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
  reason: z.string().trim().max(4000).optional()
});
