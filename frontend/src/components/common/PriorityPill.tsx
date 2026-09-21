import React from 'react';
import { Priority, TaskStatus, ProjectStatus } from '../../types';
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

export const PriorityPill: React.FC<{ priority: Priority; showIcon?: boolean; size?: 'sm' | 'md' }> = ({ 
  priority, 
  showIcon = true,
  size = 'md'
}) => {
  const configs: Record<Priority, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
    urgent: {
      label: 'Urgent',
      bg: 'bg-rose-50',
      text: 'text-rose-700 font-semibold',
      border: 'border-rose-200',
      icon: <AlertCircle className={size === 'sm' ? 'w-3 h-3 text-rose-600' : 'w-3.5 h-3.5 text-rose-600'} />
    },
    high: {
      label: 'High',
      bg: 'bg-amber-50',
      text: 'text-amber-800 font-semibold',
      border: 'border-amber-200',
      icon: <ArrowUp className={size === 'sm' ? 'w-3 h-3 text-amber-600' : 'w-3.5 h-3.5 text-amber-600'} />
    },
    medium: {
      label: 'Medium',
      bg: 'bg-sky-50',
      text: 'text-sky-700 font-medium',
      border: 'border-sky-200',
      icon: <ArrowRight className={size === 'sm' ? 'w-3 h-3 text-sky-500' : 'w-3.5 h-3.5 text-sky-500'} />
    },
    low: {
      label: 'Low',
      bg: 'bg-slate-100',
      text: 'text-slate-600 font-medium',
      border: 'border-slate-200',
      icon: <ArrowDown className={size === 'sm' ? 'w-3 h-3 text-slate-400' : 'w-3.5 h-3.5 text-slate-400'} />
    }
  };

  const config = configs[priority] || configs.medium;
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span 
      id={`priority-pill-${priority}`}
      className={`inline-flex items-center gap-1.5 rounded-md border ${config.bg} ${config.text} ${config.border} ${paddingClass} whitespace-nowrap`}
    >
      {showIcon && config.icon}
      <span>{config.label}</span>
    </span>
  );
};

export const TaskStatusBadge: React.FC<{ status: TaskStatus; size?: 'sm' | 'md' }> = ({ 
  status,
  size = 'md'
}) => {
  const configs: Record<TaskStatus, { label: string; bg: string; text: string; dot: string; icon: React.ReactNode }> = {
    backlog: {
      label: 'Backlog',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      dot: 'bg-slate-400',
      icon: <Clock className="w-3 h-3 text-slate-500" />
    },
    todo: {
      label: 'To Do',
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      dot: 'bg-indigo-500',
      icon: <CircleDot className="w-3 h-3 text-indigo-600" />
    },
    in_progress: {
      label: 'In Progress',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      dot: 'bg-blue-600',
      icon: <Sparkles className="w-3 h-3 text-blue-600" />
    },
    review: {
      label: 'Review',
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      dot: 'bg-purple-600',
      icon: <Clock className="w-3 h-3 text-purple-600" />
    },
    completed: {
      label: 'Completed',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      dot: 'bg-emerald-600',
      icon: <CheckCircle2 className="w-3 h-3 text-emerald-600" />
    }
  };

  const config = configs[status] || configs.todo;
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span 
      id={`task-status-${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.text} ${paddingClass} whitespace-nowrap`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
    </span>
  );
};

export const ProjectStatusBadge: React.FC<{ status: ProjectStatus; size?: 'sm' | 'md' }> = ({ 
  status,
  size = 'md'
}) => {
  const configs: Record<ProjectStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    planning: {
      label: 'Planning',
      bg: 'bg-sky-50 text-sky-700 border-sky-200',
      text: 'text-sky-700',
      icon: <Clock className="w-3 h-3 text-sky-600" />
    },
    active: {
      label: 'Active',
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      text: 'text-emerald-700',
      icon: <CircleDot className="w-3 h-3 text-emerald-600" />
    },
    on_hold: {
      label: 'On Hold',
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      text: 'text-amber-700',
      icon: <PauseCircle className="w-3 h-3 text-amber-600" />
    },
    completed: {
      label: 'Completed',
      bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      text: 'text-indigo-700',
      icon: <CheckCircle2 className="w-3 h-3 text-indigo-600" />
    },
    cancelled: {
      label: 'Cancelled',
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
