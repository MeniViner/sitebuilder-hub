import type { ReactNode } from "react";
import { formatDateTime } from "../../utils/format";

export function BidiValue({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

export function DateValue({ value }: { value?: string | Date | null }) {
  return <BidiValue>{formatDateTime(value)}</BidiValue>;
}
