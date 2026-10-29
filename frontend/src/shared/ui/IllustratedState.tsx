import React from 'react';
import { Compass, History, House, LayoutGrid, RefreshCcw, ServerCrash, ShieldAlert, Unlink, WifiOff } from 'lucide-react';
import { Button } from './Primitives';
import type { ErrorStateKind } from '../lib/errorStates';

/**
 * UX-02-1 illustrated Ocean states (403/404/409/500/offline/
 * invalid-context). One motif — layered waves in the canonical
 * ocean primary — so every dead end feels like the same product.
 * Built on DS primitives; colors come only from the canonical
 * theme variables.
 */

type IllustratedKind = ErrorStateKind;

const KIND_ICON: Record<IllustratedKind, React.ReactNode> = {
  forbidden: <ShieldAlert className="h-8 w-8" aria-hidden />,
  'not-found': <Compass className="h-8 w-8" aria-hidden />,
  conflict: <History className="h-8 w-8" aria-hidden />,
  server: <ServerCrash className="h-8 w-8" aria-hidden />,
  offline: <WifiOff className="h-8 w-8" aria-hidden />,
  'invalid-context': <Unlink className="h-8 w-8" aria-hidden />,
  generic: <Compass className="h-8 w-8" aria-hidden />,
};

const KIND_DEFAULTS: Record<IllustratedKind, { title: string; description: string }> = {
  forbidden: {
    title: 'دسترسی به این بخش ندارید',
    description: 'حساب شما مجوز مشاهدهٔ این صفحه را ندارد. اگر فکر می‌کنید این پیام اشتباه است، با مدیر سامانه تماس بگیرید.',
  },
  'not-found': {
    title: 'صفحهٔ مورد نظر پیدا نشد',
    description: 'نشانی واردشده وجود ندارد یا جابه‌جا شده است. از داشبورد یا انتخاب محیط ادامه دهید.',
  },
  conflict: {
    title: 'نسخهٔ داده‌ها تغییر کرده است',
    description: 'این اطلاعات هم‌زمان ویرایش شده یا نشست شما تازه‌سازی شده است. دوباره تلاش کنید تا تازه‌ترین نسخه بارگذاری شود.',
  },
  server: {
    title: 'خطای سرور رخ داد',
    description: 'عملیات در سرور کامل نشد. چند لحظهٔ دیگر دوباره تلاش کنید؛ در صورت تکرار، با مدیر سامانه تماس بگیرید.',
  },
  offline: {
    title: 'اتصال اینترنت قطع است',
    description: 'ارتباط با شبکه برقرار نیست. پس از اتصال دوباره، تلاش کنید؛ داده‌های شما روی سرور امن باقی می‌ماند.',
  },
  'invalid-context': {
    title: 'این محیط دیگر در دسترس نیست',
    description: 'عضویت شما در این محیط پایان یافته یا محیط تعلیق شده است. یک محیط دیگر انتخاب کنید؛ دسترسی‌ها همیشه سمت سرور بررسی می‌شوند.',
  },
  generic: {
    title: 'مشکلی پیش آمد',
    description: 'درخواست کامل نشد. دوباره تلاش کنید.',
  },
};

function OceanWaves() {
  return (
    <svg viewBox="0 0 320 72" className="h-16 w-64 max-w-full" fill="none" aria-hidden focusable="false">
      <path d="M2 46c26-14 52-14 78 0s52 14 78 0 52-14 78 0 52 14 78 0" stroke="var(--color-primary)" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
      <path d="M2 60c26-14 52-14 78 0s52 14 78 0 52-14 78 0 52 14 78 0" stroke="var(--color-primary-hover)" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
      <circle cx="160" cy="18" r="9" stroke="var(--color-primary)" strokeWidth="4" opacity="0.75" />
      <path d="M160 4v6M146 18h-6M180 18h-6" stroke="var(--color-primary)" strokeWidth="4" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

export interface IllustratedStateProps {
  kind: IllustratedKind;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onHome?: () => void;
  onSelectEnvironment?: () => void;
}

export function IllustratedState({
  kind,
  title,
  description,
  onRetry,
  retryLabel = 'تلاش مجدد',
  onHome,
  onSelectEnvironment,
}: IllustratedStateProps) {
  const defaults = KIND_DEFAULTS[kind];
  const isAlert = kind === 'server' || kind === 'generic' || kind === 'offline';
  return (
    <section
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? undefined : 'polite'}
      className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-12 text-center"
    >
      <OceanWaves />
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: 'var(--color-surface-muted)', color: 'var(--color-primary)' }}
      >
        {KIND_ICON[kind]}
      </div>
      <h1 className="text-lg font-black text-slate-800">{title ?? defaults.title}</h1>
      <p className="max-w-md text-sm leading-7 text-slate-500">{description ?? defaults.description}</p>
      {(onRetry || onHome || onSelectEnvironment) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {onRetry && (
            <Button type="button" onClick={onRetry}>
              <RefreshCcw className="h-4 w-4" aria-hidden />
              {retryLabel}
            </Button>
          )}
          {onSelectEnvironment && (
            <Button type="button" variant={onRetry ? 'secondary' : 'primary'} onClick={onSelectEnvironment}>
              <LayoutGrid className="h-4 w-4" aria-hidden />
              انتخاب محیط
            </Button>
          )}
          {onHome && (
            <Button type="button" variant="ghost" onClick={onHome}>
              <House className="h-4 w-4" aria-hidden />
              داشبورد
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export function ForbiddenState(props: Omit<IllustratedStateProps, 'kind'>) {
  return <IllustratedState kind="forbidden" {...props} />;
}

export function NotFoundState(props: Omit<IllustratedStateProps, 'kind'>) {
  return <IllustratedState kind="not-found" {...props} />;
}

export function ConflictState(props: Omit<IllustratedStateProps, 'kind'>) {
  return <IllustratedState kind="conflict" {...props} />;
}

export function ServerErrorState(props: Omit<IllustratedStateProps, 'kind'>) {
  return <IllustratedState kind="server" {...props} />;
}

export function OfflineState(props: Omit<IllustratedStateProps, 'kind'>) {
  return <IllustratedState kind="offline" {...props} />;
}

export function InvalidContextState(props: Omit<IllustratedStateProps, 'kind'>) {
  return <IllustratedState kind="invalid-context" {...props} />;
}
