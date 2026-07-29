import { History, LayoutDashboard } from "lucide-react";
import { useHubViewMode } from "./HubViewMode";

export function HubViewToggle({ placement }: { placement: "desktop" | "mobile" }) {
  const { mode, setMode } = useHubViewMode();
  const legacyActive = mode === "legacy";
  const label = legacyActive ? "חזרה לתצוגה החדשה" : "תצוגה ישנה";
  const Icon = legacyActive ? LayoutDashboard : History;

  const switchMode = () => {
    setMode(legacyActive ? "modern" : "legacy");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const nextFocus = placement === "mobile"
          ? document.querySelector<HTMLButtonElement>(".hub-mobile-menu:not([hidden])")
          : document.querySelector<HTMLButtonElement>(`[data-hub-view-toggle="${placement}"]`);
        nextFocus?.focus();
      });
    });
  };

  return (
    <button
      className={`btn btn-secondary hub-view-toggle hub-view-toggle-${placement}`}
      type="button"
      onClick={switchMode}
      aria-label={label}
      aria-pressed={legacyActive}
      data-hub-view-toggle={placement}
      title={label}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
