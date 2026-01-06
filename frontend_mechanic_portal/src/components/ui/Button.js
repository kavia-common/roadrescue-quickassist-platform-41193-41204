import React from "react";

// PUBLIC_INTERFACE
export function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  disabled,
  onClick,
  style,
}) {
  /** Ocean-themed button with variants: primary, secondary, ghost, danger. */
  const className = ["btn", `btn-${variant}`, `btn-${size}`].join(" ");
  return (
    <button type={type} className={className} disabled={disabled} onClick={onClick} style={style}>
      {children}
    </button>
  );
}
