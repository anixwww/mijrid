import { authHeaders, getAuthToken } from './auth';
import { isCloudWriteAuthenticated } from './firestoreTreeService';
import { logError, logTree } from './logger';
import {
  MediaUploadKind,
  primeResolvedMediaCache,
  uploadImageToFirebase,
} from './mediaSync';

const IMAGE_FILE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?|ico|heic|heif)$/i;
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const FAST_SERVER_UPLOAD_TIMEOUT_MS = 8_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Помилка читання зображення'));
    reader.readAsDataURL(file);
  });
}

export async function compressImageFile(
  file: File,
  _maxDimension?: number,
  _quality?: number,
  _isDocument?: boolean
): Promise<string> {
  return readFileAsDataUrl(file);
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export interface UploadFileResult {
  url: string;
  storage: 'firebase' | 'server' | 'local';
  size: number;
  fileName: string;
  warning?: string;
}

export interface UploadFileOptions {
  kind?: MediaUploadKind;
  isDocument?: boolean;
  maxDimension?: number;
  quality?: number;
  onProgress?: (percent: number) => void;
}

function uploadRawViaXhrFast(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ status: number; url?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/raw', true);
    xhr.timeout = FAST_SERVER_UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name || 'photo.png'));

    const headers = authHeaders();
    Object.entries(headers).forEach(([k, v]) => {
      if (v) xhr.setRequestHeader(k, v);
    });

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.min(92, Math.max(8, Math.round((ev.loaded / ev.total) * 92)));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      try {
        const json = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        resolve({
          status: xhr.status,
          url: typeof json?.url === 'string' ? json.url : undefined,
          error: typeof json?.error === 'string' ? json.error : undefined,
        });
      } catch {
        resolve({
          status: xhr.status,
          error: xhr.status >= 500 ? 'Внутрішня помилка сервера' : 'Некоректна відповідь сервера',
        });
      }
    };

    xhr.onerror = () => reject(new Error('Сервер завантаження недоступний'));
    xhr.ontimeout = () => reject(new Error('Час очікування локального сервера вичерпано'));
    xhr.onabort = () => reject(new Error('Завантаження було перервано'));
    xhr.send(file);
  });
}

function formatFirebaseUploadError(rawMessage: string): string {
  let inner = rawMessage;
  try {
    const parsed = JSON.parse(rawMessage) as { error?: unknown };
    if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
      inner = parsed.error.trim();
    }
  } catch {
    /* rawMessage is plain text */
  }
  const lower = inner.toLowerCase();
  if (lower.includes('quota exceeded') || lower.includes('resource-exhausted')) {
    return 'Вичерпано безкоштовну денну квоту Firebase Firestore. Спробуйте пізніше або зменшіть розмір фото.';
  }
  if (lower.includes('missing or insufficient permissions') || lower.includes('permission-denied')) {
    return 'Недостатньо прав Firebase для запису фото. Переконайтеся, що ви увійшли через Google з підтвердженим email.';
  }
  if (lower.includes('unavailable') || lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Помилка мережі при підключенні до Firebase. Перевірте інтернет і повторіть спробу.';
  }
  return inner;
}

export async function uploadFileToServerDetailed(
  file: File,
  options?: UploadFileOptions
): Promise<UploadFileResult> {
  if (!file || file.size === 0) {
    throw new Error('Обраний файл порожній або пошкоджений.');
  }
  const safeName = file.name || 'pasted-image.png';
  const isSvg = file.type.toLowerCase().includes('svg') || /\.svg$/i.test(safeName);
  if (isSvg) {
    throw new Error('Формат SVG заборонено з міркувань безпеки. Використовуйте PNG, JPG або WebP.');
  }
  if (!file.type.startsWith('image/') && !IMAGE_FILE_EXT_RE.test(safeName)) {
    throw new Error(`Файл "${safeName}" не є підтримуваним зображенням.`);
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`Файл "${safeName}" перевищує максимальний розмір 50 МБ.`);
  }

  const kind: MediaUploadKind =
    options?.kind || (options?.isDocument ? 'metric' : 'general');

  options?.onProgress?.(4);

  // Primary path: direct upload into Firebase Firestore (/media/{mediaId})
  if (isCloudWriteAuthenticated()) {
    try {
      const fbRes = await uploadImageToFirebase(file, {
        kind,
        isPublic: true,
        onProgress: options?.onProgress,
      });
      logTree(`Завантажено медіафайл «${safeName}» у Firebase`, {
        fileName: safeName,
        kind,
        size: fbRes.size,
        url: fbRes.url,
        deduplicated: fbRes.deduplicated,
      }, 'success');
      return {
        url: fbRes.url,
        storage: 'firebase',
        size: fbRes.size,
        fileName: safeName,
      };
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Не вдалося завантажити фото у Firebase';
      const userMsg = formatFirebaseUploadError(rawMsg);
      logError('database', `Помилка завантаження «${safeName}» у Firebase: ${rawMsg}`, {
        fileName: safeName,
        kind,
        size: file.size,
      });
      throw new Error(userMsg);
    }
  }

  // Fallback when user is in local Admin mode without Google Firebase Auth:
  // perform one fast local server attempt (never hang for 35s-175s) and warn to sync via Firebase.
  if (getAuthToken()) {
    try {
      const result = await uploadRawViaXhrFast(file, options?.onProgress);
      if (result.status >= 200 && result.status < 300 && result.url) {
        primeResolvedMediaCache(result.url, file, file.type || 'image/png');
        options?.onProgress?.(100);
        logTree(`Завантажено медіафайл «${safeName}» локально (без входу Firebase)`, {
          fileName: safeName,
          kind,
          size: file.size,
          url: result.url,
        }, 'warn');
        return {
          url: result.url,
          storage: 'server',
          size: file.size,
          fileName: safeName,
          warning:
            'Фото збережено лише локально. Увійдіть через Google (Firebase), щоб синхронізувати його в хмару.',
        };
      }
    } catch {
      /* fall through to fast auth guidance error */
    }
  }

  throw new Error(
    'Для завантаження фотографій у Firebase (аватари, метрики, альбом) увійдіть через Google.'
  );
}

export async function uploadFileToServer(
  file: File,
  options?: UploadFileOptions
): Promise<string> {
  const result = await uploadFileToServerDetailed(file, options);
  return result.url;
}
