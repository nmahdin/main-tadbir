import React, { useEffect, useState } from 'react';
import { request } from '../../api/client';

interface DamTaxonomyFieldsProps {
  folder: string;
  category: string;
  onFolder: (value: string) => void;
  onCategory: (value: string) => void;
}

type TaxonomyResponse = { data: { name: string }[] };

/** Keep legacy table labels readable while loading choices from the live DAM registry. */
export function DamTaxonomyFields({ folder, category, onFolder, onCategory }: DamTaxonomyFieldsProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      request<TaxonomyResponse>('/dam/library/folders'),
      request<TaxonomyResponse>('/dam/library/categories'),
    ])
      .then(([folderResponse, categoryResponse]) => {
        if (!active) return;
        setFolders([...new Set(folderResponse.data.map(item => item.name))]);
        setCategories([...new Set(categoryResponse.data.map(item => item.name))]);
      })
      .catch(() => {
        if (active) setError('دریافت پوشه‌ها و دسته‌ها ناموفق بود؛ فرم را دوباره باز کنید.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const fields = [
    { label: 'پوشه', value: folder, items: folders, change: onFolder },
    { label: 'دسته‌بندی', value: category, items: categories, change: onCategory },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(field => (
          <label key={field.label} className="text-xs font-bold text-slate-600">
            {field.label}
            <select
              value={field.value}
              onChange={e => field.change(e.target.value)}
              disabled={loading}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs"
            >
              <option value="">{loading ? 'در حال دریافت…' : 'بدون انتخاب'}</option>
              {field.value && !field.items.includes(field.value) && (
                <option value={field.value}>{field.value} (قبلی)</option>
              )}
              {field.items.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <p className="text-[10px] text-slate-400 leading-6">
        پوشه‌ها در مخزن دارایی و دسته‌بندی‌ها در تنظیمات دارایی مدیریت می‌شوند.
      </p>
    </div>
  );
}
