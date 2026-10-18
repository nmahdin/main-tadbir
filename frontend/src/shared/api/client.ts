import { invalidateWorkspaceModules } from '../queries/queryClient';
import { snapshotSession, rememberApiResponse } from '../queries/serverSnapshots';
import { runtime } from '../config/runtime';
import { ApiConnectionError, ApiError, SessionChangedError, parseApiError } from './errors';
export { ApiError } from './errors';
export type { ApiValidationErrors } from './errors';

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiCollection<T> {
  data: T[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
  };
  links?: {
    first?: string | null;
    last?: string | null;
    prev?: string | null;
    next?: string | null;
  };
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

const apiBaseUrl = runtime.apiUrl;
const sanctumUrl = runtime.sanctumUrl;

const isAbsoluteUrl = (url: string) => /^https?:\/\//i.test(url);

const buildUrl = (path: string) => {
  if (isAbsoluteUrl(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
};

const getErrorMessage = (payload: any, fallback: string) => {
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.error === 'string') return payload.error;
  return fallback;
};

const getCookie = (name: string): string | null => {
  const prefix = `${name}=`;
  const cookie = document.cookie.split('; ').find(value => value.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.substring(prefix.length)) : null;
};

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function fetchFromServer(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    // Abort is intentional (for example when a loading modal closes). Preserve
    // it so query/mutation callers can stop silently instead of showing a false
    // connection failure after the modal has already disappeared.
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiConnectionError('ارتباط با سرور برقرار نشد. اتصال اینترنت یا تنظیمات آدرس API را بررسی کنید.');
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (runtime.demoMode) throw new ApiError('حالت نمایشی فقط خواندنی است؛ برای ثبت تغییرات به سامانهٔ واقعی وارد شوید.', 409);
  const responseScope = snapshotSession();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  const csrfToken = getCookie('XSRF-TOKEN');
  if (csrfToken && options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
    headers.set('X-XSRF-TOKEN', csrfToken);
  }

  let body = options.body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const response = await fetchFromServer(buildUrl(path), {
    ...options,
    headers,
    body: body as BodyInit | null | undefined,
    credentials: 'include',
  });

  const payload = await parseResponse(response);
  const responseType = response.headers.get('content-type') || '';
  if (response.ok && response.status !== 204 && !responseType.includes('application/json')) {
    throw new ApiConnectionError('پاسخ سرور API معتبر نیست؛ آدرس اتصال پنل به بک‌اند را بررسی کنید.', 502);
  }
  // A late response from a previous login must neither mutate the new workspace
  // nor expire its session (including a stale 401/419).
  if (responseScope !== snapshotSession()) throw new SessionChangedError();
  if (!response.ok) {
    const bodyPayload = payload as any;
    if ([401, 419].includes(response.status) && !path.includes('/auth/')) {
      window.dispatchEvent(new CustomEvent('tadbir:session-expired', { detail: response.status }));
    }
    throw new ApiError(
      response.status >= 500 && bodyPayload?.code !== 'installation_incomplete' ? parseApiError(new ApiError('', response.status)).message : getErrorMessage(bodyPayload, `خطا در ارتباط با سرور (${response.status})`),
      response.status,
      bodyPayload?.errors,
      response.status >= 500 ? undefined : payload,
      response.headers.get('X-Request-ID') || undefined,
    );
  }

  rememberApiResponse(responseScope, path, payload);
  if (options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
    const module = path.split('?')[0].split('/')[1];
    const affected = module === 'contents'
      ? ['contents', 'tasks', 'projects', 'approvals', 'notifications']
      : module === 'tasks'
        ? ['tasks', 'projects', 'notifications']
        : [module, 'notifications'];
    void invalidateWorkspaceModules(responseScope.userId, affected);
  }
  return payload as T;
}

export async function uploadRequest<T>(path: string, body: FormData, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<T> {
  if (runtime.demoMode) throw new ApiError('حالت نمایشی فقط خواندنی است؛ برای ثبت تغییرات به سامانهٔ واقعی وارد شوید.', 409);
  const responseScope = snapshotSession();

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl(path));
    xhr.withCredentials = true;
    xhr.timeout = 120_000;
    xhr.setRequestHeader('Accept', 'application/json');
    const csrfToken = getCookie('XSRF-TOKEN');
    if (csrfToken) xhr.setRequestHeader('X-XSRF-TOKEN', csrfToken);
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => xhr.abort();
    if (signal?.aborted) { reject(new DOMException('Request aborted', 'AbortError')); return; }
    signal?.addEventListener('abort', abort, { once: true });
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    xhr.onerror = () => { cleanup(); reject(new ApiConnectionError('ارتباط با سرور هنگام بارگذاری فایل قطع شد.')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Request aborted', 'AbortError')); };
    xhr.ontimeout = () => { cleanup(); reject(new ApiConnectionError('مهلت بارگذاری فایل به پایان رسید؛ دوباره تلاش کنید.', 408)); };
    xhr.onload = () => {
      cleanup();
      if (responseScope !== snapshotSession()) { reject(new SessionChangedError()); return; }
      let payload: any;
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : undefined; }
      catch { reject(new ApiConnectionError('پاسخ سرور بارگذاری معتبر نیست.', 502)); return; }
      if (xhr.status < 200 || xhr.status >= 300) {
        if ([401, 419].includes(xhr.status) && !path.includes('/auth/')) {
          window.dispatchEvent(new CustomEvent('tadbir:session-expired', { detail: xhr.status }));
        }
        reject(new ApiError(
          xhr.status >= 500 ? parseApiError(new ApiError('', xhr.status)).message : getErrorMessage(payload, `خطا در بارگذاری فایل (${xhr.status})`),
          xhr.status,
          payload?.errors,
          xhr.status >= 500 ? undefined : payload,
          xhr.getResponseHeader('X-Request-ID') || undefined,
        ));
        return;
      }
      onProgress?.(body.get('file') instanceof File ? (body.get('file') as File).size : 1, body.get('file') instanceof File ? (body.get('file') as File).size : 1);
      rememberApiResponse(responseScope, path, payload);
      void invalidateWorkspaceModules(responseScope.userId, ['dam', 'notifications']);
      resolve(payload as T);
    };
    xhr.send(body);
  });
}

export async function initSanctum(): Promise<void> {
  const response = await fetchFromServer(`${sanctumUrl}/sanctum/csrf-cookie`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = response.status === 404
      ? 'مسیر امنیتی ورود در سرور پیدا نشد؛ آدرس بک‌اند را بررسی کنید.'
      : 'دریافت مجوز امنیتی اتصال از سرور ناموفق بود.';
    throw new ApiConnectionError(message, response.status);
  }
}

export const apiConfig = {
  baseUrl: apiBaseUrl,
  sanctumUrl: sanctumUrl || null,
};
