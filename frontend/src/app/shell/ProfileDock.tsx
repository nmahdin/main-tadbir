import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, LayoutGrid, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../providers/AuthContext';
import { useEnvironment } from '../providers/EnvironmentContext';
import { useUI } from '../providers/UIContext';
import { Avatar } from '../../shared/ui/Avatar';
import { DropdownMenu } from '../../shared/ui/Overlays';

/**
 * UX-02-1 fixed profile dock at the bottom of the sidebar.
 *
 * Identity comes from the session (AuthContext); the caption shows
 * the current environment from EnvironmentContext. The menu opens
 * upward (the DS DropdownMenu flips automatically near the viewport
 * edge). Signing out goes through AuthContext.logoutSession, which
 * keeps the session when the server call fails.
 */
export function ProfileDock({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { currentUser, logoutSession } = useAuth();
  const { current } = useEnvironment();
  const { setActiveView } = useUI();
  const navigate = useNavigate();

  const environmentCaption = current ? `${current.name}` : 'محیط کاری';

  const handleLogout = () => {
    void logoutSession().catch(() => {
      // AuthContext keeps the session on failure so the user can retry.
    });
  };

  const label = collapsed ? (
    <Avatar user={currentUser} size="sm" />
  ) : (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      <Avatar user={currentUser} size="sm" />
      <span className="min-w-0 text-right">
        <span className="block truncate text-xs font-extrabold text-slate-800">{currentUser.name || 'کاربر'}</span>
        <span className="block truncate text-[10px] text-slate-400">{environmentCaption}</span>
      </span>
      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
    </span>
  );

  return (
    <div className={`border-t border-slate-100 px-3 py-3 ${collapsed ? 'flex justify-center' : 'w-full min-w-0 [&>div]:w-full [&>div>button]:w-full'}`} data-testid="profile-dock">
      <DropdownMenu
        ariaLabel="منوی پروفایل و محیط"
        variant="ghost"
        size="sm"
        label={label}
        items={[
          {
            id: 'profile',
            label: 'پروفایل من',
            icon: <UserRound className="h-4 w-4" aria-hidden />,
            onSelect: () => { setActiveView('user-profile'); onNavigate?.(); },
          },
          {
            id: 'select-environment',
            label: 'انتخاب یا تغییر محیط',
            icon: <LayoutGrid className="h-4 w-4" aria-hidden />,
            onSelect: () => { navigate('/select-environment'); onNavigate?.(); },
          },
          {
            id: 'sign-out',
            label: 'خروج از حساب',
            icon: <LogOut className="h-4 w-4" aria-hidden />,
            danger: true,
            onSelect: handleLogout,
          },
        ]}
      />
    </div>
  );
}
