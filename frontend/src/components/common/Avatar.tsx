import React from 'react';
import { User } from '../../types';

interface AvatarProps {
  user?: User;
  src?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showTooltip?: boolean;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  user,
  src,
  name,
  size = 'md',
  showTooltip = false,
  className = ''
}) => {
  const avatarUrl = user?.avatar || src;
  const displayName = user?.name || name || 'User';

  const sizeClasses = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm font-medium',
    xl: 'w-14 h-14 text-base font-semibold'
  };

  const getInitials = (n: string) => {
    return n
      .split(' ')
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div 
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full bg-slate-200 border-2 border-white shadow-xs overflow-hidden ${sizeClasses[size]} ${className}`}
      title={showTooltip ? displayName : undefined}
    >
      {avatarUrl ? (
        <img 
          src={avatarUrl} 
          alt={displayName} 
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            // fallback to initials on broken image
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <span className="text-slate-700 font-semibold select-none">
          {getInitials(displayName)}
        </span>
      )}
    </div>
  );
};

export const AvatarGroup: React.FC<{ users: User[]; max?: number; size?: 'xs' | 'sm' | 'md' }> = ({
  users,
  max = 4,
  size = 'sm'
}) => {
  const visible = users.slice(0, max);
  const remaining = users.length - max;

  return (
    <div className="inline-flex items-center -space-x-2">
      {visible.map((user) => (
        <Avatar key={user.id} user={user} size={size} showTooltip />
      ))}
      {remaining > 0 && (
        <div className={`relative inline-flex items-center justify-center rounded-full bg-slate-100 border-2 border-white text-slate-600 font-semibold text-[10px] ${
          size === 'xs' ? 'w-5 h-5' : size === 'sm' ? 'w-7 h-7' : 'w-8 h-8'
        }`}>
          +{remaining}
        </div>
      )}
    </div>
  );
};

export const ProgressBar: React.FC<{ 
  progress: number; 
  color?: string; 
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}> = ({
  progress,
  color,
  size = 'md',
  showLabel = false
}) => {
  const clamped = Math.min(100, Math.max(0, progress));
  
  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-2.5'
  };

  const getProgressColor = () => {
    if (color) return color;
    if (clamped >= 100) return '#10b981'; // Emerald
    if (clamped >= 70) return '#6366f1'; // Indigo
    if (clamped >= 30) return '#3b82f6'; // Blue
    return '#f59e0b'; // Amber
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between text-xs mb-1.5 font-medium text-slate-600">
          <span>Progress</span>
          <span className="font-semibold text-slate-800">{clamped}%</span>
        </div>
      )}
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${heightClasses[size]}`}>
        <div 
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ 
            width: `${clamped}%`,
            backgroundColor: getProgressColor()
          }}
        />
      </div>
    </div>
  );
};
