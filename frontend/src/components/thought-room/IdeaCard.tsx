import React from 'react';
import { 
  Lightbulb, 
  ThumbsUp, 
  ThumbsDown, 
  HelpCircle, 
  MessageSquare, 
  CheckCircle2, 
  ArrowUpRight, 
  Sparkles, 
  Tag, 
  BarChart2, 
  Building, 
  Clock, 
  FolderKanban, 
  CheckSquare,
  MoreVertical,
  Trash2,
  Edit3
} from 'lucide-react';
import { Idea, IdeaStatus, Priority } from '../../types';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';

interface IdeaCardProps {
  idea: Idea;
  onOpenDetails: (idea: Idea) => void;
  onConvertToProject?: (idea: Idea) => void;
  onConvertToTask?: (idea: Idea) => void;
  onEdit?: (idea: Idea) => void;
}

export const IdeaCard: React.FC<IdeaCardProps> = ({
  idea,
  onOpenDetails,
  onConvertToProject,
  onConvertToTask,
  onEdit
}) => {
  const { users, projects, teams, deleteIdea, voteIdea, currentUser, hasPermission } = useApp();
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);

  const creator = users.find(u => u.id === idea.creatorId);
  const team = teams.find(t => t.id === idea.teamId);
  const project = projects.find(p => p.id === idea.projectId);

  const canDelete = currentUser.role === 'admin' || 
                    currentUser.role === 'project_manager' ||
                    idea.creatorId === currentUser.id || 
                    hasPermission('thinktank_delete') || 
                    hasPermission('thinktank.delete_idea') ||
                    hasPermission('thinktank.manage');

  // Votes stats
  const agreeCount = idea.votes.filter(v => v.option === 'agree').length;
  const disagreeCount = idea.votes.filter(v => v.option === 'disagree').length;
  const investigateCount = idea.votes.filter(v => v.option === 'needs_investigation').length;
  const totalVotes = idea.votes.length;
  const agreePercent = totalVotes > 0 ? Math.round((agreeCount / totalVotes) * 100) : 0;

  const userVote = idea.votes.find(v => v.userId === currentUser.id)?.option;

  const getStatusBadge = (status: IdeaStatus) => {
    switch (status) {
      case 'draft':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">پیش‌نویس اولیه</span>;
      case 'submitted':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60">در انتظار بررسی اولیه</span>;
      case 'under_review':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60">در حال ارزیابی و رأی‌گیری</span>;
      case 'needs_info':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200/60">نیازمند اطلاعات تکمیلی</span>;
      case 'approved':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">تأیید شده برای اجرا</span>;
      case 'in_progress':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/60">در حال پیاده‌سازی</span>;
      case 'implemented':
      case 'completed':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200/60">خاتمه یافته / به نتیجه رسیده</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200/60">رد شده / بایگانی</span>;
      default:
        return null;
    }
  };

  const getPriorityBadge = (p: Priority) => {
    switch (p) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800">فوری</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-orange-100 text-orange-800">اولویت بالا</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800">اولویت متوسط</span>;
      case 'low':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">عادی</span>;
    }
  };

  return (
    <div 
      className="group bg-white rounded-xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden"
    >
      {/* Top Bar Header */}
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
              {idea.code}
            </span>
            {getStatusBadge(idea.status)}
            {getPriorityBadge(idea.priority)}
            {idea.hasPoll && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200/60">
                <BarChart2 className="w-3 h-3" />
                نظرسنجی فعال
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-slate-400">
            {canDelete && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteModal(true);
                }}
                className="p-1.5 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                title="حذف ایده"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Title & Click to details */}
        <h3 
          onClick={() => onOpenDetails(idea)}
          className="text-base font-bold text-slate-800 hover:text-indigo-600 transition-colors cursor-pointer line-clamp-1 mb-2"
        >
          {idea.title}
        </h3>

        {/* Problem statement preview */}
        <div className="space-y-1.5 text-xs text-slate-600 mb-3 bg-slate-50/80 p-3 rounded-lg border border-slate-100">
          <div className="flex items-start gap-1.5">
            <span className="font-semibold text-amber-700 shrink-0">مسئله:</span>
            <p className="line-clamp-2 text-slate-600 leading-relaxed">{idea.problemSolved}</p>
          </div>
          <div className="flex items-start gap-1.5 pt-1 border-t border-slate-200/60">
            <span className="font-semibold text-emerald-700 shrink-0">راه‌حل:</span>
            <p className="line-clamp-2 text-slate-600 leading-relaxed">{idea.proposedSolution}</p>
          </div>
        </div>

        {/* Tags & Metadata */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 mb-2">
          {idea.targetDepartment && (
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
              <Building className="w-3 h-3" />
              {idea.targetDepartment}
            </span>
          )}
          {idea.tags?.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="inline-flex items-center gap-0.5 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Voting & Metrics bar */}
      <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex flex-col gap-2.5">
        {/* Voting Progress bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
            <span className="font-medium">میزان موافقت اعضا ({agreePercent}٪)</span>
            <span className="text-[11px] text-slate-400 font-mono">{totalVotes} رأی ثبت شده</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
            <div 
              style={{ width: `${totalVotes > 0 ? (agreeCount / totalVotes) * 100 : 0}%` }} 
              className="h-full bg-emerald-500 transition-all duration-300" 
              title={`موافق: ${agreeCount}`}
            />
            <div 
              style={{ width: `${totalVotes > 0 ? (investigateCount / totalVotes) * 100 : 0}%` }} 
              className="h-full bg-amber-400 transition-all duration-300" 
              title={`بررسی بیشتر: ${investigateCount}`}
            />
            <div 
              style={{ width: `${totalVotes > 0 ? (disagreeCount / totalVotes) * 100 : 0}%` }} 
              className="h-full bg-rose-500 transition-all duration-300" 
              title={`مخالف: ${disagreeCount}`}
            />
          </div>
        </div>

        {/* Interactive Quick Vote buttons */}
        <div className="flex items-center justify-between gap-1 pt-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => voteIdea(idea.id, 'agree')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                userVote === 'agree' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200'
              }`}
              title="موافقم"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              <span>{agreeCount}</span>
            </button>
            <button
              onClick={() => voteIdea(idea.id, 'needs_investigation')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                userVote === 'needs_investigation' 
                  ? 'bg-amber-500 text-white shadow-sm' 
                  : 'bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border border-slate-200'
              }`}
              title="نیاز به بررسی بیشتر"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{investigateCount}</span>
            </button>
            <button
              onClick={() => voteIdea(idea.id, 'disagree')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                userVote === 'disagree' 
                  ? 'bg-rose-600 text-white shadow-sm' 
                  : 'bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200'
              }`}
              title="مخالفم"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
              <span>{disagreeCount}</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              {idea.comments.length}
            </span>
          </div>
        </div>
      </div>

      {/* Footer: Creator & Conversion status */}
      <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {creator && <Avatar user={creator} size="sm" showTooltip />}
          <div>
            <div className="font-medium text-slate-700">{creator?.name || 'کاربر تدبیر'}</div>
            <div className="text-[11px] text-slate-400">{idea.createdAt}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {idea.convertedProjectId ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800">
              <FolderKanban className="w-3.5 h-3.5" />
              تبدیل به پروژه شد
            </span>
          ) : idea.convertedTaskId ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-100 text-indigo-800">
              <CheckSquare className="w-3.5 h-3.5" />
              تبدیل به تسک شد
            </span>
          ) : (
            <button
              onClick={() => onOpenDetails(idea)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-indigo-600 transition-colors shadow-sm"
            >
              <span>مشاهده و بررسی</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Delete Idea Confirmation Modal */}
      {showDeleteModal && (
        <div 
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 text-right"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteModal(false);
          }}
        >
          <div 
            className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            
            <h4 className="text-sm font-bold text-slate-900 mb-1.5">
              حذف ایده از اتاق فکر
            </h4>
            
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              آیا از حذف ایده <strong className="text-slate-800">«{idea.title}»</strong> اطمینان دارید؟ تمامی رأی‌ها و دیدگاه‌های ثبت‌شده حذف خواهند شد.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteIdea(idea.id);
                  setShowDeleteModal(false);
                }}
                className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
