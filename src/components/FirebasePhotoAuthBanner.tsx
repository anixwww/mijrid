import React, { useState } from 'react';
import { Cloud, LogIn, Loader2, AlertCircle } from 'lucide-react';
import { describeFirebaseAuthError, useAuth } from '../context/AuthContext';

interface FirebasePhotoAuthBannerProps {
  compact?: boolean;
  className?: string;
}

export const FirebasePhotoAuthBanner: React.FC<FirebasePhotoAuthBannerProps> = ({
  compact = false,
  className = '',
}) => {
  const { isCloudAuthenticated, loading, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (loading || isCloudAuthenticated) return null;

  const handleSignIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const details = describeFirebaseAuthError(err);
      if (details.code !== 'auth/popup-closed-by-user' && details.code !== 'auth/cancelled-popup-request') {
        setAuthError(details.message);
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div
      className={`rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/90 dark:bg-amber-950/35 text-amber-950 dark:text-amber-100 ${
        compact ? 'px-3 py-2 text-[11px]' : 'px-3.5 py-2.5 text-xs'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Cloud size={compact ? 14 : 16} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="leading-snug">
            Для завантаження та хмарного збереження фото у <strong>Firebase</strong> (аватари, метрики, альбом) увійдіть через Google.
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleSignIn()}
          disabled={signingIn}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-[11px] font-bold shadow-2xs transition-colors cursor-pointer shrink-0"
        >
          {signingIn ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Вхід...</span>
            </>
          ) : (
            <>
              <LogIn size={13} />
              <span>Увійти через Google</span>
            </>
          )}
        </button>
      </div>
      {authError && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-rose-700 dark:text-rose-300">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{authError}</span>
        </div>
      )}
    </div>
  );
};
