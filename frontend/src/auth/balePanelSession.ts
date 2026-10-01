const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * The bot places the one-time credential in the URL fragment so it is not sent
 * to the frontend host. Remove it before any API/network work or error report.
 */
export function takeBalePanelToken(location = window.location, history = window.history): string | null {
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  const params = new URLSearchParams(fragment);
  const token = params.get('bale-login');
  if (token !== null) {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }

  return token && TOKEN_PATTERN.test(token) ? token : null;
}
