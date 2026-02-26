// Simple pub/sub state management

const state = {
  licenses: [],
  customers: [],
  currentUser: null,
  sidebarCollapsed: false,
};

const listeners = new Map();

export function getState(key) {
  return state[key];
}

export function setState(key, value) {
  state[key] = value;
  const fns = listeners.get(key);
  if (fns) fns.forEach(fn => fn(value));
}

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}
