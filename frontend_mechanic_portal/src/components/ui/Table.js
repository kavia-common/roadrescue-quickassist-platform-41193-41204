import React from "react";

// PUBLIC_INTERFACE
export function Table({ columns, rows, rowKey }) {
  /** Simple responsive table. */
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r) => (
              <tr key={rowKey ? rowKey(r) : r.id}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
