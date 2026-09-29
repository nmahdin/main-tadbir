import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { request } from '../../api/client';
import { Drawer, ErrorState, LoadingState, PageHeader } from '../common/Primitives';
import { listStatuses, safeReturnTo } from '../../routing/listQuery';
import { formatPersianDate } from '../../utils/date';
import { runtime } from '../../config/runtime';
export function DetailContext({ module }: { module: string }) {
  const location = useLocation(); const back = safeReturnTo(new URLSearchParams(location.search).get('returnTo'), `/${module}`);
  return <nav aria-label="مسیر جزئیات" className="flex flex-wrap gap-4 p-3 text-sm"><Link className="ui-button ui-button-secondary" to={back}>بازگشت به فهرست</Link></nav>;
}
export function EntityPreview({ module, id, onClose, fullLink }: { module: string; id: string | null; onClose: () => void; fullLink: (id: string) => string }) {
  const { currentUser } = useAuth(); const valid = !!id && /^[1-9]\d{0,18}$/.test(id);
  const query = useQuery<{data:any}>({ queryKey: ['preview', currentUser.id, module, id], enabled: valid && !runtime.demoMode,
    queryFn: ({signal}) => request(`/${module}/${id}`, {signal}),
  });
  const row = query.data?.data;
  return <Drawer open={!!id} onClose={onClose} title="پیش‌نمایش"><div className="p-4 space-y-4">
    {!valid ? <ErrorState title="شناسهٔ مورد معتبر نیست." /> : query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <>
      <PageHeader title={row.name || row.title} /><dl className="grid grid-cols-[auto_1fr] gap-3 text-sm break-words"><dt>وضعیت</dt><dd>{listStatuses[module]?.[row.status] || row.status}</dd>
      {(row.assigneeId || row.ownerId || row.projectManagerId) && <><dt>شناسهٔ مسئول</dt><dd>{row.assigneeId || row.ownerId || row.projectManagerId}</dd></>}
      {row.deadline && <><dt>سررسید</dt><dd>{formatPersianDate(row.deadline)}</dd></>}
      {row.updatedAt && <><dt>آخرین تغییر</dt><dd>{formatPersianDate(row.updatedAt)}</dd></>}
      </dl>{row.description && <p className="whitespace-pre-wrap break-words text-sm">{row.description}</p>}
      <Link className="ui-button ui-button-primary" to={fullLink(id!)}>بازکردن صفحهٔ کامل</Link>
    </>}
  </div></Drawer>;
}
