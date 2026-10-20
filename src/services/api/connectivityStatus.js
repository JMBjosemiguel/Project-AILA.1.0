// A tiny vanilla pub-sub store so client.js (a plain module, not a React
// component) can report connectivity state and any component in the tree
// (ConnectivityBanner) can subscribe to it with useSyncExternalStore, without
// routing network internals through React context.
const listeners = new Set();
let state = { status: 'online' }; // 'online' | 'reconnecting' | 'unavailable'

export function getConnectivityState() {
  return state;
}

export function subscribeConnectivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setConnectivityStatus(status) {
  if (status === state.status) return;
  state = { status };
  listeners.forEach((listener) => listener(state));
}
