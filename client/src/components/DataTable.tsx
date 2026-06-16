import { ReactNode } from "react";
import { type HelpContentKey } from "../help/helpContent";
import { HelpLabel } from "./help/HelpLabel";

export type DataTableColumn<T> = {
  key?: string;
  header: ReactNode;
  helpKey?: HelpContentKey | string;
  width?: string | number;
  align?: "start" | "center" | "end";
  priority?: "primary" | "secondary" | "optional";
  render?: (row: T) => ReactNode;
};

export function DataTable({
  columns,
  children,
  rows,
  rowKey,
  mobileCard,
  minWidth = 900,
  density = "normal"
}: {
  columns: string[] | DataTableColumn<any>[];
  children?: ReactNode;
  rows?: any[];
  rowKey?: (row: any, index: number) => string;
  mobileCard?: (row: any) => ReactNode;
  minWidth?: number;
  density?: "normal" | "dense";
}) {
  const structuredColumns = typeof columns[0] === "object" ? columns as DataTableColumn<any>[] : null;
  const legacyColumns: Array<{ key: string; header: ReactNode; helpKey?: HelpContentKey | string }> = structuredColumns
    ? structuredColumns.map((column, index) => ({ key: column.key || `column-${index}`, header: column.header, helpKey: column.helpKey }))
    : (columns as string[]).map((header) => ({ key: header, header }));

  const hasMobileCards = Boolean(structuredColumns && rows && mobileCard);

  return (
    <div className={`table-shell table-shell-${density} ${hasMobileCards ? "table-shell-has-mobile-cards" : ""}`}>
      <div className="overflow-x-auto">
        <table className="data-table text-sm" style={{ minWidth }}>
          <thead>
            <tr>
              {legacyColumns.map((column) => (
                <th key={column.key}>
                  <HelpLabel helpKey={column.helpKey}>{column.header}</HelpLabel>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {structuredColumns && rows ? rows.map((row, index) => (
              <tr key={rowKey ? rowKey(row, index) : String(index)}>
                {structuredColumns.map((column, columnIndex) => (
                  <td key={column.key || `column-${columnIndex}`} style={{ width: column.width, textAlign: column.align === "center" ? "center" : column.align === "end" ? "left" : "right" }}>
                    {column.render ? column.render(row) : column.key ? row[column.key] : null}
                  </td>
                ))}
              </tr>
            )) : children}
          </tbody>
        </table>
      </div>
      {hasMobileCards ? (
        <div className="mobile-row-list">
          {rows!.map((row, index) => (
            <div key={rowKey ? rowKey(row, index) : String(index)} className="mobile-row-card">
              {mobileCard!(row)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
