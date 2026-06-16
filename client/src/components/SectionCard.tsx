import { ReactNode } from "react";
import { type HelpContentKey } from "../help/helpContent";
import { Panel } from "./Panel";

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  compact = false,
  helpKey
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  helpKey?: HelpContentKey | string;
}) {
  return (
    <Panel title={title} subtitle={subtitle} actions={actions} compact={compact} helpKey={helpKey}>
      {children}
    </Panel>
  );
}
