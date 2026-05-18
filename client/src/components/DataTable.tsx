import { ReactNode } from "react";

export function DataTable({
  columns,
  children,
  minWidth = 900
}: {
  columns: string[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="table-shell">
      <div className="overflow-x-auto">
        <table className="data-table text-sm" style={{ minWidth }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
