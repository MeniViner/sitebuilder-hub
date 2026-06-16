export function isHubHelpIconsEnabled(value?: string) {
  return String(value ?? "true").toLowerCase() !== "false";
}

export const HUB_HELP_ICONS_ENABLED = isHubHelpIconsEnabled(import.meta.env.VITE_HUB_HELP_ICONS_ENABLED);
