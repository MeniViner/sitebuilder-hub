import { Site } from "../models/Site";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export type AuthorizedPersonalNumber = {
  personalNumber: string;
  role: "admin";
  source: "hardcoded" | "bootstrap" | "site-admin";
  isBootstrapAdmin: boolean;
  siteId?: string;
  siteCode?: string;
  siteName?: string;
};

const HARDCODED_ALWAYS_ALLOWED_PERSONAL_NUMBERS = ["s8856096", "s8856095"];

export const normalizePersonalNumber = (value: string) => String(value || "").replace(/\D/g, "");

export function getHardcodedAlwaysAllowedPersonalNumbers() {
  return Array.from(new Set(HARDCODED_ALWAYS_ALLOWED_PERSONAL_NUMBERS.map(normalizePersonalNumber).filter(Boolean)));
}

export function getBootstrapAdminPersonalNumbers() {
  return Array.from(new Set(env.BOOTSTRAP_ADMIN_PERSONAL_NUMBERS.split(",").map(normalizePersonalNumber).filter(Boolean)));
}

export function getAllBootstrapPersonalNumbers() {
  return Array.from(new Set([...getHardcodedAlwaysAllowedPersonalNumbers(), ...getBootstrapAdminPersonalNumbers()]));
}

function collectPersonalNumbers(site: any) {
  const values: string[] = [];

  values.push(site.ownerPersonalNumber || "");

  for (const row of site.txtAdmins || []) values.push(row.personalNumber || "");
  for (const row of site.siteCollectionAdmins || []) values.push(row.personalNumber || "");
  for (const row of site.ownersGroupAdmins || []) values.push(row.personalNumber || "");

  return values.map(normalizePersonalNumber).filter(Boolean);
}

export async function findAuthorizedPersonalNumber(rawPersonalNumber: string): Promise<AuthorizedPersonalNumber | null> {
  const pn = normalizePersonalNumber(rawPersonalNumber);
  if (!pn) return null;
  const masked = `***${pn.slice(-4)}`;
  logger.debug("auth", "Searching authorized personal number", { personalNumber: masked });

  if (getHardcodedAlwaysAllowedPersonalNumbers().includes(pn)) {
    logger.info("auth", "Personal number matched hardcoded admin", { personalNumber: masked });
    return {
      personalNumber: pn,
      role: "admin",
      source: "hardcoded",
      isBootstrapAdmin: true,
      siteCode: "hub-hardcoded-admin",
      siteName: "Hub Hardcoded Admin"
    };
  }

  if (getBootstrapAdminPersonalNumbers().includes(pn)) {
    logger.info("auth", "Personal number matched bootstrap admin", { personalNumber: masked });
    return {
      personalNumber: pn,
      role: "admin",
      source: "bootstrap",
      isBootstrapAdmin: true,
      siteCode: "hub-bootstrap",
      siteName: "Hub Bootstrap Admin"
    };
  }

  const sites = await Site.find({ status: { $ne: "archived" } }).select({
    siteCode: 1,
    displayName: 1,
    ownerPersonalNumber: 1,
    txtAdmins: 1,
    siteCollectionAdmins: 1,
    ownersGroupAdmins: 1
  });

  for (const site of sites) {
    const allPns = new Set(collectPersonalNumbers(site));
    if (allPns.has(pn)) {
      logger.info("auth", "Personal number matched site admin", {
        personalNumber: masked,
        siteId: site._id.toString(),
        siteCode: site.siteCode
      });
      return {
        personalNumber: pn,
        role: "admin",
        source: "site-admin",
        isBootstrapAdmin: false,
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        siteName: site.displayName
      };
    }
  }

  logger.warn("auth", "Personal number did not match any authorized source", {
    personalNumber: masked,
    scannedSites: sites.length
  });
  return null;
}
