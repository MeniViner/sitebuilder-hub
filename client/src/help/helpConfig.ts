import { HUB_FEATURE_POLICY, isExplicitlyEnabled } from "../config/uiMode";

export function isHubHelpIconsEnabled(value?: string) {
  return isExplicitlyEnabled(value);
}

export const HUB_HELP_ICONS_ENABLED = HUB_FEATURE_POLICY.helpIcons;
