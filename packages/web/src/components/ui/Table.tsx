import type { ReactNode } from "react";

export interface TableProps {
  caption?: string;
  children: ReactNode;
  className?: string;
}

export function Table({ caption, children, className }: TableProps) {
  return (
    <div className="table-wrap">
      <table className={["table", className].filter(Boolean).join(" ")}>
        {caption ? <caption className="visually-hidden">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function TableEmpty({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tbody>
      <tr>
        <td colSpan={colSpan}>
          <div className="empty-state" data-testid="table-empty">
            <p className="empty-state__title">Nothing here yet</p>
            <p>{message}</p>
          </div>
        </td>
      </tr>
    </tbody>
  );
}
