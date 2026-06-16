import { ReactNode } from "react";
import { type HelpContentKey } from "../../help/helpContent";
import { HelpIcon } from "./HelpIcon";

export function HelpLabel({
  children,
  helpKey,
  className = ""
}: {
  children: ReactNode;
  helpKey?: HelpContentKey | string;
  className?: string;
}) {
  return (
    <span className={`help-label ${className}`}>
      <span>{children}</span>
      <HelpIcon helpKey={helpKey} />
    </span>
  );
}
