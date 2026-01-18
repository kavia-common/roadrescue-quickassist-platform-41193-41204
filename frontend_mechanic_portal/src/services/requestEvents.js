/**
 * Tiny in-app event bus for request mutations (accept / status updates).
 * This ensures cross-page propagation even without realtime subscriptions.
 */

const EVENT_NAME = "rrqa:requests_changed";

/**
 * PUBLIC_INTERFACE
 */
export function emitRequestsChanged(payload = {}) {
  /** Emit a global event indicating requests have changed and lists should refresh. */
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
  } catch {
    // ignore
  }
}

/**
 * PUBLIC_INTERFACE
 */
export function subscribeRequestsChanged(handler) {
  /** Subscribe to requests-changed events; returns an unsubscribe function. */
  const wrapped = (e) => handler?.(e?.detail || {});
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}
