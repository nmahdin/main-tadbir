import React from 'react';
import { DamLibrary } from './DamLibrary';
import { ModuleErrorBanner } from '../common/Feedback';

/** Main DAM view deliberately uses the same backend-backed entry point as projects and tasks. */
export const DamMainView: React.FC = () => (
  <div className="space-y-4">
    {/* نمایش خطای بارگذاری مخزن دارایی‌ها برای دیباگ آسان */}
    <ModuleErrorBanner modules={['assets', 'asset folders']} label="دارایی‌های دیجیتال" />
    <DamLibrary />
  </div>
);
