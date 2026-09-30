import { queryClient } from '../queries/queryClient';
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
  } catch {
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
    );
  }

  rememberApiResponse(responseScope, path, payload);
  if (options.method && options.method !== 'GET') {
    const module = path.split('?')[0].split('/')[1];
    const affected = module === 'contents' ? ['contents','tasks','projects','approvals'] : module === 'tasks' ? ['tasks','projects'] : [module];
    for (const name of affected) for (const scope of ['pages','entity','preview','workspace']) {
      void queryClient.invalidateQueries({ queryKey: [scope, responseScope.userId, name] });
    }
    // هر فرمان موفق می‌تواند در سرور اعلان تازه‌ای تولید کند؛ زنگ و صندوق اعلان
    // باید همان لحظه و بدون انتظار برای polling بعدی به‌روز شوند.
    for (const scope of ['pages', 'workspace']) {
      void queryClient.invalidateQueries({ queryKey: [scope, responseScope.userId, 'notifications'] });
    }
  }
  return payload as T;
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
