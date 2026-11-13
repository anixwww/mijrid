import { logAuth, logError } from './logger';

const TOKEN_KEY = 'rodovid_admin_token';
const LEGACY_ROLE_KEY = 'roodovid_role';

export const AUTH_EXPIRED_EVENT = 'rodovid:auth-expired';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(LEGACY_ROLE_KEY);
    logAuth('Авторизаційний токен адміністратора збережено в локальну сесію', {}, 'info');
  } catch (err) {
    console.warn('Cannot persist auth token:', err);
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_ROLE_KEY);
    logAuth('Сесію адміністратора закрито. Перехід у режим гостя.', {}, 'info');
  } catch {
    /* ignore */
  }
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Drops the token and notifies the app when the server rejects it. */
export function handleUnauthorized(): void {
  logError('auth', 'Токен адміністратора застарів або недійсний. Сесію скинуто.');
  clearAuthToken();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

/** Checks the stored token against the server. */
export async function verifyStoredToken(): Promise<boolean> {
  if (!getAuthToken()) return false;
  try {
    const res = await fetch('/api/session', { headers: authHeaders() });
    if (res.status === 401) {
      logError('auth', 'Сервер відхилив токен адміністратора (401 Unauthorized)');
      clearAuthToken();
      return false;
    }
    if (res.ok) {
      logAuth('Успішна верифікація токена адміністратора на сервері', {}, 'success');
      return true;
    }
    return res.ok;
  } catch (err) {
    logError('auth', 'Помилка мережі при перевірці сесії адміністратора', { error: String(err) });
    // Network problem: keep the token, the server will re-check on the next save.
    return true;
  }
}

/** Queries whether the server requires an admin password. */
export async function fetchAuthMode(): Promise<{ passwordRequired: boolean }> {
  try {
    const res = await fetch('/api/auth-mode');
    const data = await res.json().catch(() => null);
    if (res.ok && data && typeof data.passwordRequired === 'boolean') {
      return { passwordRequired: data.passwordRequired };
    }
  } catch {
    /* ignore */
  }
  return { passwordRequired: false };
}

/** Logs in on the server (password optional when server runs in passwordless mode); stores the token on success. */
export async function loginWithPassword(password = ''): Promise<boolean> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success && data.token) {
      setAuthToken(data.token);
      logAuth('Успішний вхід у режим Адміністратора', {}, 'success');
      return true;
    }
    logError('auth', 'Спроба входу в режим Адміністратора відхилена');
    return false;
  } catch (err) {
    logError('auth', 'Мережева помилка при спробі входу адміністратора', { error: String(err) });
    return false;
  }
}
