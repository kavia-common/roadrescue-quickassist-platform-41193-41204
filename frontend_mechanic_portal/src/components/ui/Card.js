import React from "react";

// PUBLIC_INTERFACE
export function Card({ title, subtitle, children, actions }) {
  /** Card container for forms and lists. */
  return (
    <section className="card">
      {(title || subtitle || actions) && (
        <div className="card-header">
          <div>
            {title ? <h2 className="card-title">{title}</h2> : null}
            {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}
