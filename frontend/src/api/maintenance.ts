import { ApiResponse, request } from './client';
import { runtime } from '../config/runtime';

/**
 * نگهداری سامانه از داخل پنل (بدون SSH): پشتیبان‌گیری پایگاه‌داده، دانلود،
 * بارگذاری، بازگردانی و تغییر محل ذخیرهٔ فایل‌ها.
 *
 * همهٔ این مسیرها با مجوز `settings.manage` محافظت می‌شوند و بازگردانی افزون بر
 * آن به تأیید نام دقیق فایل نیاز دارد.
 */
export interface MaintenanceStorageStatus {
  files_root: string;
  inside_application: boolean;
  writable: boolean;
  free_bytes: number | null;
  source: 'settings' | 'env' | 'default';
  configured_files_root: string | null;
  legacy_root: string;
  legacy_files: number;
  legacy_bytes: number;
  pending_relocation: number;
  suggested_root: string;
}

export interface MaintenanceDatabaseStatus {
  driver: string;
  name: string;
  bytes: number | null;
  tables: number;
  /** نام جدول‌های موجود؛ برای گزارش «کدام جدول‌ها وجود دارند» در پنل. */
  table_names?: string[];
  rows: number;
}

export interface MaintenanceBackup {
  file: string;
  bytes: number;
  created_at: string | null;
  rows: number | null;
  tables: string[] | null;
  migrations?: string[];
  verified?: boolean | null;
}

export interface MaintenanceOverview {
  storage: MaintenanceStorageStatus;
  database: MaintenanceDatabaseStatus;
  backups: MaintenanceBackup[];
  backup_root: { path: string; inside_application: boolean; keep: number };
  limits: { upload_max_filesize: number; post_max_size: number; max_execution_time: number };
}

export interface AutomationResult {
  deadlines: { due: number; unsynced: number };
  notifications: { scanned: number; reminders: number };
  bale: { enabled: boolean; sent: number; received: number; message?: string | null };
}

export interface RelocationResult {
  applied: boolean;
  processed: number;
  moved: number;
  copied: number;
  skipped: number;
  failed: number;
  pending: number;
  errors: string[];
}

export const maintenanceApi = {
  overview(signal?: AbortSignal) {
    return request<ApiResponse<MaintenanceOverview>>('/maintenance/overview', { signal, cache: 'no-store' });
  },

  createBackup(body: { include_files?: boolean; label?: string }) {
    return request<ApiResponse<{ backups: MaintenanceBackup[]; warnings: string[]; pruned: string[] }>>(
      '/maintenance/database-backups',
      { method: 'POST', body },
    );
  },

  /** دانلود فایل پشتیبان از مرورگر (کوکی نشست همراه درخواست می‌رود). */
  async downloadBackup(file: string): Promise<void> {
    const response = await fetch(`${runtime.apiUrl}/maintenance/database-backups/${encodeURIComponent(file)}/download`, {
      credentials: 'include',
      headers: { Accept: 'application/gzip' },
      cache: 'no-store',
    });

    if (!response.ok) throw new Error('دانلود فایل پشتیبان ممکن نشد؛ دسترسی یا وضعیت سرور را بررسی کنید.');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },

  deleteBackup(file: string) {
    return request<ApiResponse<{ backups: MaintenanceBackup[] }>>(
      `/maintenance/database-backups/${encodeURIComponent(file)}`,
      { method: 'DELETE' },
    );
  },

  uploadBackup(file: File) {
    const body = new FormData();
    body.append('file', file);
    return request<ApiResponse<{ file: string; bytes: number; backups: MaintenanceBackup[] }>>(
      '/maintenance/database-backups/upload',
      { method: 'POST', body, cache: 'no-store' },
    );
  },

  restoreBackup(file: string, confirm: string) {
    return request<ApiResponse<{ restored: string; statements: number | null; safety_backup: string | null; backups: MaintenanceBackup[] }>>(
      `/maintenance/database-backups/${encodeURIComponent(file)}/restore`,
      { method: 'POST', body: { confirm }, cache: 'no-store' },
    );
  },

  updateStorage(filesRoot: string, relocate: boolean) {
    return request<ApiResponse<{ files_root: string; previous: string | null; external: boolean; relocation: RelocationResult | null }>>(
      '/maintenance/storage',
      { method: 'PUT', body: { files_root: filesRoot, relocate } },
    );
  },

  relocateStorage(body: { apply?: boolean; limit?: number; prune_source?: boolean }) {
    return request<ApiResponse<RelocationResult>>('/maintenance/storage/relocate', { method: 'POST', body });
  },

  /**
   * اجرای دستی به‌روزرسانی خودکار: هم‌گام‌سازی وضعیت «تأخیر»، ساخت یادآوری‌های
   * سرسید‌شده و ارسال صف بله. روی هاستی که cron ندارد، همین دکمه کار scheduler را
   * انجام می‌دهد و تکرارش اعلان تکراری نمی‌سازد.
   */
  runAutomation(body: { deadlines?: boolean; notifications?: boolean; bale?: boolean; limit?: number } = {}) {
    return request<ApiResponse<AutomationResult>>('/maintenance/automation', { method: 'POST', body, cache: 'no-store' });
  },
};
