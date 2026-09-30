import React, { useEffect, useState } from 'react';
import { PublishingPlatform } from '../../types';
import { X, Globe, Check, MonitorSmartphone } from 'lucide-react';
import { PLATFORM_ICON_OPTIONS, platformIcon } from '../../utils/platformIcons';

export { PLATFORM_ICON_OPTIONS, platformIcon } from '../../utils/platformIcons';

interface PlatformModalProps {
  isOpen: boolean;
  platform: PublishingPlatform | null;
  onClose: () => void;
  onSave: (data: Omit<PublishingPlatform, 'id'> & { id?: string }) => void;
}

export const PlatformModal: React.FC<PlatformModalProps> = ({ isOpen, platform, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [iconName, setIconName] = useState('Globe');
  const [color, setColor] = useState('#6366f1');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setName(platform?.name || '');
    setIconName(platform?.iconName || 'Globe');
    setColor(platform?.color || '#6366f1');
    setDescription(platform?.description || '');
    setAddress(platform?.urlPattern || platform?.defaultHandle || platform?.handle || '');
    setIsEnabled(platform?.isEnabled ?? true);
  }, [isOpen, platform]);

  if (!isOpen) return null;

  const Icon = platformIcon(iconName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: platform?.id,
      name: name.trim(),
      iconName,
      color,
      bg: `${color}14`,
      description: description.trim() || undefined,
      urlPattern: address.trim() || undefined,
      isEnabled,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right" dir="rtl">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs" style={{ backgroundColor: color }}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                {platform ? 'ویرایش پلتفرم انتشار' : 'افزودن پلتفرم انتشار جدید'}
              </h2>
              <p className="text-xs text-slate-500">مشخصات کانال یا پلتفرم انتشار محتوا</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* نام */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              نام پلتفرم <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <MonitorSmartphone className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="مثال: کانال تلگرام روابط عمومی"
                className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* آیکون */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">آیکون</label>
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-slate-200" style={{ backgroundColor: `${color}14`, color }}>
                  <Icon className="w-5 h-5" />
                </span>
                <select
                  value={iconName}
                  onChange={e => setIconName(e.target.value)}
                  className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden cursor-pointer"
                >
                  {PLATFORM_ICON_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* رنگ */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">رنگ</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer bg-white p-1 shrink-0"
                />
                <input
                  type="text"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  dir="ltr"
                  maxLength={7}
                  className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* توضیحات اختیاری */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              توضیحات <span className="text-slate-400 font-medium">(اختیاری)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="توضیح کوتاه درباره کاربرد این پلتفرم..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all resize-none"
            />
          </div>

          {/* آدرس اختیاری */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              آدرس <span className="text-slate-400 font-medium">(اختیاری)</span>
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="https://t.me/example"
                dir="ltr"
                className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all text-left font-mono"
              />
            </div>
          </div>

          {/* وضعیت فعال */}
          <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer">
            <span className="text-xs font-bold text-slate-800">پلتفرم فعال باشد</span>
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={e => setIsEnabled(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded-sm"
            />
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-200 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{platform ? 'ذخیره تغییرات' : 'افزودن پلتفرم'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
