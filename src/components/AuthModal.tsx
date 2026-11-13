import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Shield, KeyRound, Eye, Cloud, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchAuthMode } from '../utils/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  onLoginAsAdmin?: (password?: string) => boolean | Promise<boolean>;
  onSwitchToGuest?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  isAdmin = false,
  onLoginAsAdmin,
  onSwitchToGuest,
}) => {
  const { currentUser, isCloudAuthenticated, signInWithGoogle, logOut } = useAuth();
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cloudAuthBusy, setCloudAuthBusy] = useState(false);
  const [cloudAuthError, setCloudAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setPasswordError(null);
      setCloudAuthError(null);
      let cancelled = false;
      void fetchAuthMode().then((mode) => {
        if (!cancelled) setPasswordRequired(mode.passwordRequired);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setCloudAuthBusy(true);
    setCloudAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setCloudAuthError(err?.message || 'Не вдалося увійти через Google');
      }
    } finally {
      setCloudAuthBusy(false);
    }
  };

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordRequired && !password.trim()) {
      setPasswordError('Будь ласка, введіть пароль');
      return;
    }

    setIsSubmitting(true);
    setPasswordError(null);

    try {
      if (onLoginAsAdmin) {
        const success = await onLoginAsAdmin(password.trim());
        if (success) {
          onClose();
        } else {
          setPasswordError(
            passwordRequired ? 'Невірний пароль адміністратора' : 'Не вдалося увійти в режим адміністратора'
          );
        }
      } else {
        setPasswordError('Авторизація недоступна');
      }
    } catch {
      setPasswordError('Помилка входу. Спробуйте ще раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200/90 w-full max-w-sm overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-stone-800 text-white flex items-center justify-center shadow-xs">
              {isAdmin ? <ShieldCheck size={18} /> : <KeyRound size={18} />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 leading-tight">
                {isAdmin ? 'Режим: Адміністратор' : 'Авторизація'}
              </h3>
              <p className="text-[11px] text-stone-500">
                {isAdmin ? 'Повні права редагування родоводу' : 'Вхід адміністратора або перегляд як гість'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isAdmin ? (
            /* Admin Logged-in State */
            <div className="space-y-3">
              <div className="p-3.5 bg-stone-100 rounded-xl border border-stone-200 text-stone-800 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-xs text-stone-900">
                  <ShieldCheck size={16} className="text-stone-700 shrink-0" />
                  <span>Ви увійшли як Адміністратор</span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Вам доступне повне керування деревом: додавання осіб, редагування зв'язків та імпорт/експорт.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onSwitchToGuest) onSwitchToGuest();
                  onClose();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-800 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
              >
                <Eye size={15} className="text-stone-600" />
                <span>Перейти в режим Гостя (лише перегляд)</span>
              </button>
            </div>
          ) : (
            /* Guest / Login State */
            <div className="space-y-3">
              <form onSubmit={handleAdminLoginSubmit} className="space-y-3">
                {passwordRequired ? (
                  <div>
                    <label className="block text-xs font-bold text-stone-900 mb-1">
                      Пароль адміністратора
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordError(null);
                      }}
                      placeholder="Введіть пароль"
                      autoFocus
                      className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-900 font-medium"
                    />
                  </div>
                ) : (
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Пароль не потрібен. Для швидкого входу також натисніть 5 разів клавішу{' '}
                    <span className="font-mono font-bold text-stone-800">A</span> або 5 разів мишею.
                  </p>
                )}
                {passwordError && (
                  <p className="text-[11px] text-rose-600 font-semibold">{passwordError}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 active:scale-98"
                >
                  <ShieldCheck size={16} />
                  <span>{isSubmitting ? 'Вхід...' : 'Увійти як Адмін'}</span>
                </button>
              </form>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-medium text-stone-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Shield size={14} className="text-stone-500" />
                <span>Продовжити як Гість</span>
              </button>
            </div>
          )}

          {/* Firebase Cloud Sync (Google Auth) */}
          <div className="pt-3 border-t border-stone-200 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
              <Cloud size={15} className="text-emerald-700 shrink-0" />
              <span>Хмарна база Firebase Firestore</span>
            </div>

            {isCloudAuthenticated && currentUser ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="text-[11px] text-emerald-950 font-semibold truncate">
                  Підключено: {currentUser.email}
                </div>
                <p className="text-[11px] text-emerald-800 leading-snug">
                  Усі полотна автоматично зберігаються у Firebase Firestore та не зникають після оновлення сайту.
                </p>
                <button
                  type="button"
                  onClick={() => void logOut()}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-white hover:bg-stone-50 border border-emerald-200 text-[11px] font-semibold text-stone-700 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={12} />
                  <span>Відключити Google-акаунт</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-stone-600 leading-snug">
                  Увійдіть через Google, щоб синхронізувати дерево з постійною базою Firebase Firestore.
                </p>
                {cloudAuthError && (
                  <p className="text-[11px] text-rose-600 font-medium">{cloudAuthError}</p>
                )}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={cloudAuthBusy}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-60"
                >
                  <Cloud size={15} />
                  <span>{cloudAuthBusy ? 'Підключення…' : 'Увійти через Google (Firebase)'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
