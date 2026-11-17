import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSession, getSessionToken, getSessionValue, saveSession } from './session.js';

function createMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('unchecked remember-me stores the session only in session storage', () => {
  globalThis.window = {
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
  };

  saveSession({ token: 'token-value', userId: 'user-1', name: 'A User' });

  assert.equal(window.localStorage.getItem('token'), null);
  assert.equal(window.sessionStorage.getItem('token'), 'token-value');
  assert.equal(getSessionToken(), 'token-value');
  assert.equal(getSessionValue('userName'), 'A User');
});

test('remember-me stores the session persistently and replaces prior storage', () => {
  globalThis.window = {
    localStorage: createMemoryStorage({ token: 'old-token', userName: 'Old User' }),
    sessionStorage: createMemoryStorage({ token: 'session-token', userId: 'old-user' }),
  };

  saveSession({ token: 'persistent-token', userId: 'user-2', name: 'Another User' }, true);

  assert.equal(window.localStorage.getItem('token'), 'persistent-token');
  assert.equal(window.sessionStorage.getItem('token'), null);
  assert.equal(getSessionToken(), 'persistent-token');
});

test('logout cleanup removes session credentials and profile data from both stores', () => {
  globalThis.window = {
    localStorage: createMemoryStorage({ token: 'persistent-token', userId: 'user-1', userName: 'A User' }),
    sessionStorage: createMemoryStorage({ token: 'session-token', userId: 'user-2', userName: 'Another User' }),
  };

  clearSession();

  for (const storage of [window.localStorage, window.sessionStorage]) {
    assert.equal(storage.getItem('token'), null);
    assert.equal(storage.getItem('userId'), null);
    assert.equal(storage.getItem('userName'), null);
  }
  assert.equal(getSessionToken(), null);
});
