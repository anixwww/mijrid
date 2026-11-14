import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AUTH_EXPIRED_EVENT,
  clearAuthToken,
  fetchAuthMode,
  getAuthToken,
  loginWithPassword,
  verifyStoredToken,
} from '../utils/auth';
import { ToastMessage } from '../components/Toast';
import { logAuth } from '../utils/logger';

interface UseAdminRoleOptions {
  showToast: (msg: Omit<ToastMessage, 'id'>) => void;
  onGuestCleanup?: () => void;
}

export function useAdminRole({
  showToast,
  onGuestCleanup,
}: UseAdminRoleOptions) {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => Boolean(getAuthToken()));

  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;

  useEffect(() => {
    try {
      localStorage.removeItem('rodovid_admin_role');
    } catch {
      /* ignore */
    }

    let cancelled = false;
    const token = getAuthToken();
    if (token) {
      verifyStoredToken().then(async (valid) => {
        if (cancelled) return;
        if (valid) {
          setIsAdmin(true);
          return;
        }
        // If server restarted/redeployed with a new SESSION_SECRET and passwordless mode is active,
        // seamlessly re-issue the admin token instead of demoting the admin to Guest mode.
        const mode = await fetchAuthMode();
        if (cancelled) return;
        if (!mode.passwordRequired) {
          const refreshed = await loginWithPassword('');
          if (!cancelled) {
            setIsAdmin(refreshed);
          }
          return;
        }
        setIsAdmin(false);
      });
    } else {
      setIsAdmin(false);
    }

    const onExpired = () => {
      setIsAdmin(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      onGuestCleanup?.();
    }
  }, [isAdmin, onGuestCleanup]);

  const loginInFlightRef = useRef(false);

  const handleLoginAsAdmin = useCallback(
    async (password = '', method: 'mouse_click' | 'auto' = 'mouse_click'): Promise<boolean> => {
      if (loginInFlightRef.current) return false;
      loginInFlightRef.current = true;
      try {
        const ok = await loginWithPassword(password);
        if (ok) {
          setIsAdmin(true);
          const methodLabel = method === 'mouse_click' ? '5× клік миші' : 'сесія';
          logAuth(`Вхід у режим адміністратора (${methodLabel})`, { method }, 'success');
          showToast({
            type: 'success',
            title: 'Режим адміністратора',
            message: 'Авторизація успішна. Доступно повне редагування.',
          });
          return true;
        }
        logAuth('Невдала спроба входу в режим адміністратора', { method }, 'warn');
        return false;
      } finally {
        loginInFlightRef.current = false;
      }
    },
    [showToast]
  );

  // Secret admin entry strictly via 5 rapid mouse clicks
  useEffect(() => {
    if (isAdmin) return;

    let clickCount = 0;
    let lastClickTime = 0;
    let lastClickX = 0;
    let lastClickY = 0;

    const isEditableElement = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName?.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        node.isContentEditable
      );
    };

    const handleClick = (e: MouseEvent) => {
      if (isAdminRef.current || e.button !== 0) return;
      if (isEditableElement(e.target)) return;

      const now = Date.now();
      const dist = Math.hypot(e.clientX - lastClickX, e.clientY - lastClickY);
      if (now - lastClickTime > 800 || dist > 60) {
        clickCount = 1;
      } else {
        clickCount += 1;
      }
      lastClickTime = now;
      lastClickX = e.clientX;
      lastClickY = e.clientY;

      if (clickCount >= 5) {
        clickCount = 0;
        lastClickTime = 0;
        void handleLoginAsAdmin('', 'mouse_click');
      }
    };

    window.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('click', handleClick, true);
    };
  }, [isAdmin, handleLoginAsAdmin]);

  const handleSwitchToGuest = useCallback(() => {
    clearAuthToken();
    setIsAdmin(false);
    logAuth('Перехід у режим гостя (вихід з адміністрування)', undefined, 'info');
    showToast({
      type: 'info',
      title: 'Режим гостя',
      message: 'Перейшли в режим гостя (лише перегляд).',
    });
  }, [showToast]);

  const handleToggleAdminRole = useCallback(() => {
    if (isAdmin) {
      handleSwitchToGuest();
    }
  }, [isAdmin, handleSwitchToGuest]);

  return {
    isAdmin,
    isAdminRef,
    handleLoginAsAdmin,
    handleSwitchToGuest,
    handleToggleAdminRole,
  };
}
