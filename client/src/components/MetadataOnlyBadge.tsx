import { StatusToken } from "./StatusToken";

export function MetadataOnlyBadge({ mode = "metadata" }: { mode?: "metadata" | "readonly" | "soon" | "notConnected" }) {
  const config = {
    metadata: { label: "מטא־דאטה", kind: "metadata" as const, helpKey: "mode.metadataOnly" },
    readonly: { label: "קריאה בלבד", kind: "readonly" as const, helpKey: "mode.readOnly" },
    soon: { label: "בקרוב", kind: "neutral" as const, helpKey: undefined },
    notConnected: { label: "SharePoint דרך הדפדפן עדיין לא נבדק", kind: "neutral" as const, helpKey: "sharepoint.browserConnector" }
  }[mode];

  return <StatusToken kind={config.kind} label={config.label} helpKey={config.helpKey} />;
}
