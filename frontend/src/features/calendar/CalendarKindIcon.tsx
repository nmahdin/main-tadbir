import React from 'react';
import { FolderKanban, CheckSquare, PenTool, Send } from 'lucide-react';

export type CalendarEventKind = 'project' | 'task' | 'content' | 'publish';

const KIND_CONFIG: Record<CalendarEventKind, { label: string; color: string; bg: string; Icon: React.FC<{ className?: string }> }> = {
  project: { label: 'پروژه', color: 'text-indigo-600', bg: 'bg-indigo-50', Icon: FolderKanban },
  task: { label: 'تسک', color: 'text-sky-600', bg: 'bg-sky-50', Icon: CheckSquare },
  content: { label: 'محتوا', color: 'text-rose-600', bg: 'bg-rose-50', Icon: PenTool },
  publish: { label: 'انتشار', color: 'text-emerald-600', bg: 'bg-emerald-50', Icon: Send },
};

export const CalendarEventKindIcon: React.FC<{ kind: CalendarEventKind; className?: string }> = ({
  kind,
  className = 'w-3 h-3'
}) => {
  const config = KIND_CONFIG[kind];
  const Icon = config.Icon;
  return (
    <span title={config.label} className={`inline-flex items-center justify-center shrink-0 ${config.color}`}>
      <Icon className={className} />
    </span>
  );
};

export const CalendarKindLegend: React.FC<{ kinds?: CalendarEventKind[] }> = ({
  kinds = ['project', 'task', 'content']
}) => (
  <div className="flex items-center gap-2 flex-wrap" dir="rtl">
    <span className="text-[11px] font-bold text-slate-400">راهنما:</span>
    {kinds.map(kind => {
      const config = KIND_CONFIG[kind];
      const Icon = config.Icon;
      return (
        <span
          key={kind}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${config.bg} ${config.color}`}
        >
          <Icon className="w-3.5 h-3.5" />
          {config.label}
        </span>
      );
    })}
  </div>
);
