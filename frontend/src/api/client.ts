export type ApiValidationErrors = Record<string, string[]>;

export class ApiError extends Error {
  readonly status: number;
  readonly errors?: ApiValidationErrors;
  readonly payload?: unknown;

  constructor(message: string, status: number, errors?: ApiValidationErrors, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.payload = payload;
  }
}

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

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
const sanctumUrl = (import.meta.env.VITE_SANCTUM_URL || '').replace(/\/$/, '');

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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
    body: body as BodyInit | null | undefined,
    credentials: 'include',
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    const bodyPayload = payload as any;
    throw new ApiError(
      getErrorMessage(bodyPayload, `خطا در ارتباط با سرور (${response.status})`),
      response.status,
      bodyPayload?.errors,
      payload,
    );
  }

  return payload as T;
}

export async function initSanctum(): Promise<void> {
  const response = await fetch(`${sanctumUrl}/sanctum/csrf-cookie`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError('دریافت مجوز امنیتی اتصال ناموفق بود.', response.status);
  }
}

export const apiConfig = {
  baseUrl: apiBaseUrl,
  sanctumUrl: sanctumUrl || null,
};
