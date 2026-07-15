export type HubUiMode = "normal" | "help" | "diagnostics" | "labs";

export type HubFeaturePolicy = {
  mode: HubUiMode;
  helpIcons: boolean;
  labs: boolean;
};

const enabledValues = new Set(["1", "true", "yes", "on", "enabled"]);

export function isExplicitlyEnabled(value?: string | null) {
  return enabledValues.has(String(value ?? "").trim().toLowerCase());
}

export function resolveHubUiMode(value?: string | null): HubUiMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "help" || normalized === "diagnostics" || normalized === "labs") return normalized;
  return "normal";
}

export function buildHubFeaturePolicy(values: {
  mode?: string | null;
  helpIcons?: string | null;
  labs?: string | null;
} = {}): HubFeaturePolicy {
  const mode = resolveHubUiMode(values.mode);
  return {
    mode,
    helpIcons: isExplicitlyEnabled(values.helpIcons),
    labs: mode === "labs" || isExplicitlyEnabled(values.labs)
  };
}

export const HUB_FEATURE_POLICY = buildHubFeaturePolicy({
  mode: import.meta.env.VITE_HUB_UI_MODE,
  helpIcons: import.meta.env.VITE_HUB_HELP_ICONS_ENABLED,
  labs: import.meta.env.VITE_HUB_LABS_ENABLED
});

