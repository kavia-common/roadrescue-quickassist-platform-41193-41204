import React from "react";

// PUBLIC_INTERFACE
export function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  name,
  error,
  hint,
  required,
  disabled,
}) {
  /** Input with label, hint, and error. */
  return (
    <div className="field">
      {label ? (
        <label className="label" htmlFor={name}>
          {label} {required ? <span className="req">*</span> : null}
        </label>
      ) : null}
      <input
        id={name}
        name={name}
        className={`input ${error ? "input-error" : ""}`}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
      />
      {hint ? <div className="hint">{hint}</div> : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
