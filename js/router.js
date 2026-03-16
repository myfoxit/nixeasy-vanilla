// Hash-based router supporting patterns like #/opportunities/:oppId/quotes/:quoteId

const routes = [];
let currentCleanup = null;
let container = null;

export function initRouter(containerEl) {
  container = containerEl;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

export function addRoute(pattern, handler) {
  // pattern like '/opportunities/:oppId/quotes/:quoteId'
  const paramNames = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({ regex: new RegExp('^' + regexStr + '$'), paramNames, handler });
}

export function navigate(hash) {
  window.location.hash = hash;
}

function handleRoute() {
  const rawHash = window.location.hash.slice(1) || '/dashboard';

  // Split path from query string
  const qIndex = rawHash.indexOf('?');
  const hash = qIndex >= 0 ? rawHash.slice(0, qIndex) : rawHash;
  const queryString = qIndex >= 0 ? rawHash.slice(qIndex + 1) : '';

  // Parse query params
  const query = {};
  if (queryString) {
    for (const part of queryString.split('&')) {
      const [k, v] = part.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }

  // Cleanup previous view
  if (currentCleanup && typeof currentCleanup === 'function') {
    currentCleanup();
  }
  currentCleanup = null;

  for (const route of routes) {
    const match = hash.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      // Merge query params into params (route params take precedence)
      Object.assign(params, query, params);
      if (container) {
        container.innerHTML = '';
        const result = route.handler(container, params);
        if (result && typeof result.destroy === 'function') {
          currentCleanup = result.destroy;
        }
      }
      return;
    }
  }

  // Default: redirect to dashboard
  if (hash !== '/dashboard') {
    navigate('/dashboard');
  }
}

// Get current hash path
export function getCurrentPath() {
  return window.location.hash.slice(1) || '/dashboard';
}
