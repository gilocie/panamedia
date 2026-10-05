/**
 * Tiny registry that lets non-Electron modules (hardwareEngine.cjs,
 * mediaConverter.cjs) talk to the C++ core engine.
 *
 * electron.cjs owns `sendCoreRequest`, but those modules are required *by*
 * electron.cjs -- requiring it back would be circular. So electron.cjs registers
 * the transport here at startup and callers resolve it lazily at call time.
 *
 * When the engine is unavailable every helper resolves to `null` instead of
 * throwing, which is what lets callers fall back to their Node implementation.
 */

let transport = null;
let enabled = false;
let eventSink = null;
const listeners = new Set();

/** Called once by electron.cjs once sendCoreRequest is defined. */
function register(fn) {
  transport = fn;
}

/** Called by electron.cjs when the C++ engine starts/stops. */
function setEnabled(value) {
  enabled = !!value;
  if (!enabled) listeners.clear();
}

/**
 * Called by electron.cjs with every event line the engine emits. Events have no
 * `id`, so they were previously dropped on the floor -- which meant engine
 * progress (`scan_progress`, `convert_progress`) never reached the UI.
 */
function setEventSink(fn) {
  eventSink = fn;
}

/** Subscribe to engine events. Returns an unsubscribe function. */
function onEvent(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

/** Dispatches an event to subscribers. Called by electron.cjs. */
function dispatchEvent(name, payload) {
  for (const fn of listeners) {
    try { fn(name, payload); } catch (e) { /* a bad listener must not kill the rest */ }
  }
  if (eventSink) {
    try { eventSink(name, payload); } catch (e) {}
  }
}

/**
 * Calls a core action. Resolves to `null` when the engine is down or the call
 * fails, so callers can distinguish "no engine" from a legitimate falsy result.
 */
async function call(action, payload = {}, timeoutMs = 5000) {
  if (!enabled || !transport) return null;
  try {
    return await transport(action, payload, timeoutMs);
  } catch (e) {
    return null;
  }
}

module.exports = { register, setEnabled, call, setEventSink, onEvent, dispatchEvent };