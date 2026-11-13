import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AUTH_EXPIRED_EVENT,
  clearAuthToken,
  getAuthToken,
  loginWithPassword,
  verifyStoredToken,
} from '../utils/auth';
import { ToastMessage } from '../components/Toast';
import { logAuth } from '../utils/logger';

interface UseAdminRoleOptions {
  showToast: (msg: Omit<ToastMessage, 'id'>) => void;
  onOpenAuthModal: () => void;
  onGuestCleanup?: () => void;
}

export function useAdminRole({
  showToast,
  onOpenAuthModal,
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
      verifyStoredToken().then((valid) => {
        if (!cancelled) {
          setIsAdmin(valid);
        }
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
    async (
      password = '',
      method: 'button' | 'key_a' | 'mouse_click' = 'button'
    ): Promise<boolean> => {
      if (loginInFlightRef.current) return false;
      loginInFlightRef.current = true;
      try {
        const ok = await loginWithPassword(password);
        if (ok) {
          setIsAdmin(true);
          const methodLabel =
            method === 'key_a'
              ? '5× натискання клавіші A'
              : method === 'mouse_click'
              ? '5× клік миші'
              : 'форма входу';
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

  // Enter admin mode without a password via 5 presses of 'A'/'А' or 5 rapid mouse clicks
  useEffect(() => {
    if (isAdmin) return;

    let keyPressCount = 0;
    let lastKeyTime = 0;

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

    const triggerAdminEntry = async (method: 'key_a' | 'mouse_click') => {
      const ok = await handleLoginAsAdmin('', method);
      if (!ok) {
        onOpenAuthModal();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAdminRef.current || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableElement(document.activeElement) || isEditableElement(e.target)) return;

      const lowerKey = e.key.toLowerCase();
      const isAKey = e.code === 'KeyA' || lowerKey === 'a' || lowerKey === 'а';
      if (!isAKey) {
        keyPressCount = 0;
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime > 900) {
        keyPressCount = 1;
      } else {
        keyPressCount += 1;
      }
      lastKeyTime = now;

      if (keyPressCount >= 5) {
        keyPressCount = 0;
        lastKeyTime = 0;
        void triggerAdminEntry('key_a');
      }
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
        void triggerAdminEntry('mouse_click');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick, true);
    };
  }, [isAdmin, handleLoginAsAdmin, onOpenAuthModal]);

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
    } else {
      onOpenAuthModal();
    }
  }, [isAdmin, handleSwitchToGuest, onOpenAuthModal]);

  return {
    isAdmin,
    isAdminRef,
    handleLoginAsAdmin,
    handleSwitchToGuest,
    handleToggleAdminRole,
  };
}
