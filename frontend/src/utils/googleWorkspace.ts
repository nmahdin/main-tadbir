import type { GoogleMeetSettings } from '../types';

/**
 * ویژگی‌های Google Workspace فقط زمانی در رابط کاربری نمایش داده می‌شوند که
 * سرور واقعاً به آن متصل باشد. تا آماده‌شدن «اتصال سرور»، هیچ دکمه یا پنل
 * گوگلی در سامانه دیده نمی‌شود؛ سرویس‌های Docs و Sheets هم به Drive نیاز دارند.
 */
export type GoogleService = 'drive' | 'docs' | 'sheets' | 'meet';

export const googleServiceEnabled = (settings: GoogleMeetSettings, service: GoogleService): boolean => {
  if (settings.serverConfigured !== true) return false;
  if (service === 'meet') return settings.enabled === true;
  if (settings.driveEnabled !== true) return false;
  if (service === 'drive') return true;
  return service === 'docs' ? settings.docsEnabled === true : settings.sheetsEnabled === true;
};

/**
 * پیوندهای ساخته‌شدهٔ قبلی هرگز پنهان نمی‌شوند؛ اگر رکوردی از قبل به گوگل
 * وصل شده باشد، کارت آن حتی با خاموش‌شدن اتصال سرور قابل مشاهده می‌ماند.
 */
export const showGoogleWorkspacePanel = (settings: GoogleMeetSettings, service: 'docs' | 'sheets', hasExistingLink: boolean): boolean =>
  hasExistingLink || googleServiceEnabled(settings, service);
