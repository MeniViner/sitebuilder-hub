import { ArrowUpLeft, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { DateValue } from "./BidiValue";
import { HumanStatus } from "./HumanStatus";
import type { HumanOperationState } from "../../domain/presentation";

export function ActivityRow({
  title,
  detail,
  state,
  stateLabel,
  at,
  to
}: {
  title: string;
  detail?: string;
  state: HumanOperationState;
  stateLabel: string;
  at?: string;
  to?: string;
}) {
  const content = (
    <>
      <div className="normal-activity-main">
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
      <HumanStatus compact state={state} label={stateLabel} />
      <time dateTime={at} className="normal-activity-time"><Clock3 size={14} /><DateValue value={at} /></time>
      {to ? <ArrowUpLeft size={16} aria-hidden="true" /> : null}
    </>
  );
  return to ? <Link className="normal-activity-row" to={to}>{content}</Link> : <div className="normal-activity-row">{content}</div>;
}
