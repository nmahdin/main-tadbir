import React from 'react';
import { runtime } from '../../config/runtime';
import { isChunkLoadError } from '../../utils/chunkLoadError';
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, X, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * اجزای مشترک «حالت لودینگ» و «نمایش خطا» در سراسر سامانه تدبیر.
 *
 * هدف: دیباگ آسان — هر خطای ماژول با نام ماژول، پیام و (در صورت وجود) جزئیات
 * فنی نمایش داده می‌شود و امکان تلاش مجدد فراهم است.
 */

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

const SPINNER_SIZE_CLASS: Record<SpinnerSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
  xl: 'w-10 h-10',
};

export const InlineSpinner: React.FC<{ size?: SpinnerSize; className?: string }> = ({ size = 'sm', className = '' }) => (
  <Loader2 className={`animate-spin ${SPINNER_SIZE_CLASS[size]} ${className}`} aria-hidden="true" />
);

export const LoadingSpinner: React.FC<{
  size?: SpinnerSize;
  label?: string;
  className?: string;
}> = ({ size = 'lg', label = 'در حال بارگذاری...', className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-3 py-10 text-slate-500 ${className}`} role="status" aria-live="polite">
    <InlineSpinner size={size} className="text-indigo-600" />
    {label && <span className="text-xs font-bold">{label}</span>}
  </div>
);

/**
 * لودر تمام‌صفحه برای بارگذاری اولیه فضای کار (پس از ورود).
 */
export const WorkspaceLoader: React.FC<{ label?: string }> = ({ label = 'در حال بارگذاری فضای کاری تدبیر...' }) => (
  <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-slate-50/95 backdrop-blur-sm" dir="rtl">
    <div className="relative">
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-600 to-indigo-800 shadow-xl shadow-indigo-200 flex items-center justify-center">
        <InlineSpinner size="xl" className="text-white" />
      </div>
    </div>
    <div className="text-center space-y-1">
      <p className="text-sm font-extrabold text-slate-800">{label}</p>
      <p className="text-xs text-slate-500">دریافت داده‌ها از سرور، لطفاً شکیبا باشید.</p>
    </div>
  </div>
);

/**
 * قاب نمایش خطا با جزئیات فنی برای دیباگ.
 */
export const ErrorAlert: React.FC<{
  title?: string;
  message: string;
  /** جزئیات فنی (کد وضعیت HTTP، پاسخ سرور و...) که برای دیباگ نمایش داده می‌شود. */
  detail?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  onClose?: () => void;
}> = ({
  title = 'خطا در انجام عملیات',
  message,
  detail,
  onRetry,
  retryLabel = 'تلاش مجدد',
  className = '',
  onClose,
}) => (
  <div
    role="alert"
    className={`rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-2 ${className}`}
    dir="rtl"
  >
    <div className="flex items-start gap-2.5">
      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs font-extrabold text-rose-900">{title}</p>
        <p className="text-xs text-rose-800 leading-relaxed break-words">{message}</p>
        {detail && (
          <details className="mt-1 group">
            <summary className="text-[11px] font-bold text-rose-700 cursor-pointer select-none hover:text-rose-900">
              جزئیات فنی خطا (برای دیباگ)
            </summary>
            <pre className="mt-1.5 p-2.5 bg-white/80 border border-rose-200 rounded-lg text-[10px] leading-5 text-rose-900 whitespace-pre-wrap break-all max-h-40 overflow-auto" dir="ltr">
              {detail}
            </pre>
          </details>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            {retryLabel}
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
            title="بستن"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  </div>
);

/**
 * بنر خطای ماژول‌ها: اگر بارگذاری بخشی از فضای کاری (مثلاً ایده‌ها) با خطا
 * مواجه شده باشد، بالای نمای مرتبط نمایش داده می‌شود.
 *
 * نمونه استفاده:  <ModuleErrorBanner modules={['ideas']} label="اتاق فکر" />
 */
export const ModuleErrorBanner: React.FC<{
  /** شناسه ماژول‌های مرتبط با این نما (همان کلیدهای moduleErrors در AppContext). */
  modules: string[];
  /** برچسب نمایشی بخش؛ در صورت خالی بودن از نام ماژول‌ها ساخته می‌شود. */
  label?: string;
  className?: string;
}> = ({ modules, label, className = '' }) => {
  const { moduleErrors, reloadWorkspace, isReloadingWorkspace } = useApp();

  const failed = modules
    .map(module => ({ module, error: moduleErrors[module] }))
    .filter((item): item is { module: string; error: { message: string; detail?: string } } => Boolean(item.error));

  if (failed.length === 0) return null;

  const title = label ? `خطا در بارگذاری بخش «${label}»` : 'خطا در بارگذاری بخشی از داده‌ها';

  return (
    <ErrorAlert
      title={title}
      message={failed.map(item => `${item.module}: ${item.error.message}`).join(' | ')}
      detail={failed.map(item => item.error.detail).filter(Boolean).join('\n') || null}
      onRetry={reloadWorkspace}
      retryLabel={isReloadingWorkspace ? 'در حال تلاش مجدد...' : 'بارگذاری مجدد'}
      className={className}
    />
  );
};

/**
 * مرز خطای React: کرش یک نما کل سامانه را نمی‌بندد و پیام قابل فهم
 * به همراه جزئیات فنی (استک) نمایش داده می‌شود.
 */
interface ErrorBoundaryState {
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** تغییر این کلید، وضعیت مرز خطا را ریست می‌کند (مثلاً هنگام جابه‌جایی بین نماها). */
  resetKey?: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: ErrorBoundaryProps;
  declare setState: (state: Partial<ErrorBoundaryState> | ((prev: ErrorBoundaryState) => Partial<ErrorBoundaryState>)) => void;
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // لاگ کنسول برای دیباگ توسعه‌دهنده
    console.error('[Tadbir] Render error captured by ErrorBoundary:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): React.ReactNode {
    if (this.state.error) {
      const chunkFailure = isChunkLoadError(this.state.error);
      return (
        <div className="p-6 max-w-2xl mx-auto" dir="rtl">
          <ErrorAlert
            title={chunkFailure ? 'نسخهٔ تازه‌ای از سامانه منتشر شده است' : 'خطای غیرمنتظره در این بخش'}
            message={chunkFailure
              ? 'فایل این بخش دیگر با نسخهٔ باز مرورگر هماهنگ نیست. صفحه را برای دریافت نسخهٔ جدید بارگذاری کنید.'
              : 'نمایش این بخش با خطا متوقف شد. سایر بخش‌های سامانه سالم هستند.'}
            detail={runtime.development ? this.state.error.message : undefined}
            onRetry={chunkFailure ? () => window.location.reload() : () => this.setState({ error: null })}
            retryLabel={chunkFailure ? 'بارگذاری نسخهٔ جدید' : 'تلاش مجدد برای نمایش'}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

// DS-2.1: floating notifications are owned by the single ToastProvider
// stack in ./Notifications (toast.success/error/warning/info). The old
// AppContext-backed ToastViewport was removed so there is exactly one
// notification renderer; AppContext.notify() delegates to it.
