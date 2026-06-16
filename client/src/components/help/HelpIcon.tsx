import { CSSProperties, FocusEvent, useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { HUB_HELP_ICONS_ENABLED } from "../../help/helpConfig";
import { getHelpContent, type HelpContentKey } from "../../help/helpContent";

const TOOLTIP_MARGIN = 12;
const TOOLTIP_MAX_WIDTH = 352;
const TOOLTIP_MIN_WIDTH = 288;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function HelpIcon({
  helpKey,
  className = ""
}: {
  helpKey?: HelpContentKey | string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const item = getHelpContent(helpKey);

  const updateTooltipPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button || typeof window === "undefined") return;

    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const tooltipWidth = clamp(viewportWidth - TOOLTIP_MARGIN * 2, TOOLTIP_MIN_WIDTH, TOOLTIP_MAX_WIDTH);
    const preferredLeft = rect.right - tooltipWidth;
    const alternateLeft = rect.left;
    const canUsePreferred = preferredLeft >= TOOLTIP_MARGIN;
    const canUseAlternate = alternateLeft + tooltipWidth <= viewportWidth - TOOLTIP_MARGIN;
    const left = canUsePreferred
      ? preferredLeft
      : canUseAlternate
        ? alternateLeft
        : clamp(preferredLeft, TOOLTIP_MARGIN, viewportWidth - TOOLTIP_MARGIN - tooltipWidth);
    const arrowX = clamp(rect.left + rect.width / 2 - left, 16, tooltipWidth - 16);

    setTooltipStyle({
      "--help-tooltip-arrow-x": `${arrowX}px`,
      left,
      top: rect.bottom + 8,
      width: tooltipWidth
    } as CSSProperties);
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updateTooltipPosition();
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);
    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [open, updateTooltipPosition]);

  if (!HUB_HELP_ICONS_ENABLED || !item) return null;

  const helpAnchor = item.anchor ? `#${item.anchor}` : "";
  const openTooltip = () => {
    setOpen(true);
    window.requestAnimationFrame(updateTooltipPosition);
  };
  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOpen(false);
  };

  return (
    <span
      className={`help-icon-wrap ${className}`}
      onMouseEnter={openTooltip}
      onMouseLeave={() => setOpen(false)}
      onFocus={openTooltip}
      onBlur={handleBlur}
    >
      <button
        ref={buttonRef}
        type="button"
        className="help-icon-button"
        aria-label={`הסבר: ${item.title}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        data-help-icon={item.key}
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => {
            const next = !current;
            if (next) window.requestAnimationFrame(updateTooltipPosition);
            return next;
          });
        }}
      >
        <Info size={13} />
      </button>
      {open ? (
        <span className="help-tooltip" role="tooltip" id={id} style={tooltipStyle}>
          <span className="help-tooltip-title">{item.title}</span>
          <span className="help-tooltip-description">{item.description}</span>
          {item.fix ? <span className="help-tooltip-fix">{item.fix}</span> : null}
          <Link className="help-tooltip-link" to={{ pathname: "/help", hash: helpAnchor }}>
            מרכז הסברים
          </Link>
        </span>
      ) : null}
    </span>
  );
}
