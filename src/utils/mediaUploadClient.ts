import { authHeaders } from './auth';
import { logError, logServer } from './logger';

const IMAGE_FILE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?|ico|heic|heif)$/i;
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_LOCAL_FALLBACK_BYTES = 4 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 35_000;

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  storage: 'server' | 'local';
  size: number;
  fileName: string;
  warning?: string;
}

export interface UploadFileOptions {
  isDocument?: boolean;
  maxDimension?: number;
  quality?: number;
  onProgress?: (percent: number) => void;
}

function uploadRawViaXhr(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ status: number; url?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/raw', true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name || 'metric-photo.png'));

    const headers = authHeaders();
    Object.entries(headers).forEach(([k, v]) => {
      if (v) xhr.setRequestHeader(k, v);
    });

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.min(95, Math.max(5, Math.round((ev.loaded / ev.total) * 95)));
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

    xhr.onerror = () => reject(new Error('Помилка мережі під час передачі файлу'));
    xhr.ontimeout = () => reject(new Error('Час очікування завантаження на сервер вичерпано'));
    xhr.onabort = () => reject(new Error('Завантаження було перервано'));
    xhr.send(file);
  });
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

  options?.onProgress?.(4);
  let lastErrorMsg = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await uploadRawViaXhr(file, options?.onProgress);
      if (result.status >= 200 && result.status < 300 && result.url) {
        options?.onProgress?.(100);
        logServer(`Завантажено медіафайл «${safeName}» на сервер`, {
          fileName: safeName,
          size: file.size,
          url: result.url,
        }, 'success');
        return {
          url: result.url,
          storage: 'server',
          size: file.size,
          fileName: safeName,
        };
      }
      if (result.error) {
        lastErrorMsg = result.error;
      }
      if (result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429) {
        break;
      }
    } catch (err) {
      lastErrorMsg = (err as Error)?.message || 'Помилка передачі файлу';
      if (attempt === 2) {
        console.warn('Raw upload failed after retries, trying base64 endpoint:', err);
      }
    }
    await delay(300 * (attempt + 1));
  }

  const dataUrl = await readFileAsDataUrl(file);
  options?.onProgress?.(70);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(
        '/api/upload',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ image: dataUrl, filename: safeName }),
        },
        UPLOAD_TIMEOUT_MS
      );
      if (res.ok) {
        const json = await res.json();
        if (json?.success && typeof json.url === 'string' && json.url) {
          options?.onProgress?.(100);
          logServer(`Завантажено медіафайл «${safeName}» на сервер (резервний канал)`, {
            fileName: safeName,
            size: file.size,
            url: json.url,
          }, 'success');
          return {
            url: json.url,
            storage: 'server',
            size: file.size,
            fileName: safeName,
          };
        }
      } else {
        const errJson = await res.json().catch(() => null);
        if (errJson?.error) lastErrorMsg = errJson.error;
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        break;
      }
    } catch (err) {
      lastErrorMsg = (err as Error)?.message || 'Помилка резервного завантаження';
      if (attempt === 1) {
        console.warn('Server upload failed, evaluating local offline fallback:', err);
      }
    }
    await delay(350);
  }

  if (file.size > MAX_LOCAL_FALLBACK_BYTES) {
    const errMessage = `${lastErrorMsg ? `${lastErrorMsg}. ` : ''}Не вдалося зберегти великий файл (${(file.size / (1024 * 1024)).toFixed(1)} МБ) на сервері. Перевірте з'єднання та повторіть спробу.`;
    logError('server', `Не вдалося завантажити файл «${safeName}»: ${errMessage}`, {
      fileName: safeName,
      size: file.size,
    });
    throw new Error(errMessage);
  }

  options?.onProgress?.(100);
  logServer(`Медіафайл «${safeName}» збережено локально (офлайн-резерв)`, {
    fileName: safeName,
    size: file.size,
  }, 'warn');
  return {
    url: dataUrl,
    storage: 'local',
    size: file.size,
    fileName: safeName,
    warning:
      'Сервер тимчасово недоступний: фото збережено локально у браузері й буде відправлено на сервер під час синхронізації.',
  };
}

export async function uploadFileToServer(
  file: File,
  options?: UploadFileOptions
): Promise<string> {
  const result = await uploadFileToServerDetailed(file, options);
  return result.url;
}
