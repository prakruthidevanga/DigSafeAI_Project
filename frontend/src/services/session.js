export function getSessionToken() {
  return window.localStorage.getItem('token') || window.sessionStorage.getItem('token');
}

export function getSessionValue(key) {
  return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
}

export function saveSession({ token, userId, name }, rememberMe = false) {
  clearSession();
  const storage = rememberMe ? window.localStorage : window.sessionStorage;
  storage.setItem('token', token);
  storage.setItem('userId', userId);
  storage.setItem('userName', name);
}

export function clearSession() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    storage.removeItem('token');
    storage.removeItem('userId');
    storage.removeItem('userName');
  }
}
