import React from 'react';
import { Priority, TaskStatus, ProjectStatus } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  AlertCircle,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Clock,
  CheckCircle2,
  CircleDot,
  PauseCircle,
  XCircle,
  Sparkles
} from 'lucide-react';

const PRIORITY_FALLBACK: Record<Priority, { label: string; color: string }> = {
  urgent: { label: 'فوری', color: '#ef4444' },
  high: { label: 'بالا', color: '#f59e0b' },
  medium: { label: 'متوسط', color: '#0ea5e9' },
  low: { label: 'پایین', color: '#94a3b8' },
};

export const PriorityPill: React.FC<{ priority: Priority; showIcon?: boolean; size?: 'sm' | 'md' }> = ({
  priority,
  showIcon = true,
  size = 'md'
}) => {
  let taskPriorities: { id: string; label: string; color: string }[] = [];
  try {
    taskPriorities = useApp().taskPriorities;
  } catch {
    taskPriorities = [];
  }

  const setting = taskPriorities.find(p => p.id === priority);
  const fallback = PRIORITY_FALLBACK[priority] || PRIORITY_FALLBACK.medium;
  const label = setting?.label || fallback.label;
  const color = setting?.color || fallback.color;

  const icons: Record<Priority, React.ReactNode> = {
    urgent: <AlertCircle className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} style={{ color }} />,
    high: <ArrowUp className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} style={{ color }} />,
    medium: <ArrowRight className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} style={{ color }} />,
    low: <ArrowDown className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} style={{ color }} />,
  };

  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      id={`priority-pill-${priority}`}
      className={`inline-flex items-center gap-1.5 rounded-md border font-semibold ${paddingClass} whitespace-nowrap`}
      style={{ backgroundColor: `${color}14`, borderColor: `${color}45`, color }}
    >
      {showIcon && (icons[priority] || icons.medium)}
      <span>{label}</span>
    </span>
  );
};

const STATUS_FALLBACK: Record<TaskStatus, { label: string; color: string }> = {
  backlog: { label: 'در صف بررسی', color: '#64748b' },
  todo: { label: 'برای انجام', color: '#6366f1' },
  in_progress: { label: 'در حال انجام', color: '#3b82f6' },
  review: { label: 'در حال بررسی', color: '#8b5cf6' },
  completed: { label: 'تکمیل‌شده', color: '#10b981' },
};

export const TaskStatusBadge: React.FC<{ status: TaskStatus; size?: 'sm' | 'md' }> = ({
  status,
  size = 'md'
}) => {
  let taskStatuses: { id: string; label: string; color: string }[] = [];
  try {
    taskStatuses = useApp().taskStatuses;
  } catch {
    taskStatuses = [];
  }

  const setting = taskStatuses.find(s => s.id === status);
  const fallback = STATUS_FALLBACK[status] || STATUS_FALLBACK.todo;
  const label = setting?.label || fallback.label;
  const color = setting?.color || fallback.color;

  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      id={`task-status-${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${paddingClass} whitespace-nowrap`}
      style={{ backgroundColor: `${color}14`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
};

export const ProjectStatusBadge: React.FC<{ status: ProjectStatus; size?: 'sm' | 'md' }> = ({
  status,
  size = 'md'
}) => {
  const configs: Record<ProjectStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    planning: {
      label: 'برنامه‌ریزی',
      bg: 'bg-sky-50 text-sky-700 border-sky-200',
      text: 'text-sky-700',
      icon: <Clock className="w-3 h-3 text-sky-600" />
    },
    active: {
      label: 'فعال',
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      text: 'text-emerald-700',
      icon: <CircleDot className="w-3 h-3 text-emerald-600" />
    },
    on_hold: {
      label: 'متوقف',
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      text: 'text-amber-700',
      icon: <PauseCircle className="w-3 h-3 text-amber-600" />
    },
    completed: {
      label: 'تکمیل‌شده',
      bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      text: 'text-indigo-700',
      icon: <CheckCircle2 className="w-3 h-3 text-indigo-600" />
    },
    cancelled: {
      label: 'لغوشده',
      bg: 'bg-slate-100 text-slate-600 border-slate-200',
      text: 'text-slate-600',
      icon: <XCircle className="w-3 h-3 text-slate-500" />
    }
  };

  const config = configs[status] || configs.active;
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      id={`project-status-${status}`}
      className={`inline-flex items-center gap-1.5 rounded-md border font-medium ${config.bg} ${paddingClass} whitespace-nowrap`}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
};
