import { useEffect, useState } from "react";

// PUBLIC_INTERFACE
export function useDebouncedValue(value, delayMs = 250) {
  /** Returns a debounced version of `value` that updates after `delayMs` of no changes. */
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
