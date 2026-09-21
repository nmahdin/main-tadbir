import React, { useState } from 'react';
import { 
  X, 
  Lightbulb, 
  ThumbsUp, 
  ThumbsDown, 
  HelpCircle, 
  MessageSquare, 
  Send, 
  Sparkles, 
  FolderKanban, 
  CheckSquare, 
  Clock, 
  Building, 
  DollarSign, 
  Activity, 
  BarChart2, 
  CornerDownLeft, 
  Smile, 
  Paperclip, 
  Share2, 
  Trash2, 
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  TrendingUp,
  FileText
} from 'lucide-react';
import { Idea, IdeaStatus, IdeaVoteOption, Priority } from '../../types';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';

interface IdeaDetailsModalProps {
  ideaId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenConvertToProject: (idea: Idea) => void;
  onOpenConvertToTask: (idea: Idea) => void;
}

export const IdeaDetailsModal: React.FC<IdeaDetailsModalProps> = ({
  ideaId,
  isOpen,
  onClose,
  onOpenConvertToProject,
  onOpenConvertToTask
}) => {
  const { 
    ideas, 
    users, 
    projects, 
    teams, 
    assets,
    currentUser, 
    updateIdea, 
    deleteIdea, 
    voteIdea, 
    votePollOption, 
    addIdeaComment, 
    toggleIdeaCommentReaction,
    startDirectChatWithUser,
    hasPermission,
    triggerCelebration
  } = useApp();

  const [commentText, setCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [voteComment, setVoteComment] = useState('');
  const [activeTab, setActiveTab] = useState<'discussion' | 'votes' | 'timeline' | 'poll'>('discussion');

  const idea = ideas.find(i => i.id === ideaId);

  if (!isOpen || !idea) return null;

  const creator = users.find(u => u.id === idea.creatorId);
  const team = teams.find(t => t.id === idea.teamId);
  const project = projects.find(p => p.id === idea.projectId);
  const convertedProject = projects.find(p => p.id === idea.convertedProjectId);

  // Voting metrics
  const agreeVotes = idea.votes.filter(v => v.option === 'agree');
  const disagreeVotes = idea.votes.filter(v => v.option === 'disagree');
  const investigateVotes = idea.votes.filter(v => v.option === 'needs_investigation');
  const totalVotes = idea.votes.length;
  const agreePercent = totalVotes > 0 ? Math.round((agreeVotes.length / totalVotes) * 100) : 0;

  const currentUserVote = idea.votes.find(v => v.userId === currentUser.id);

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addIdeaComment(idea.id, commentText.trim(), replyToId || undefined);
    setCommentText('');
    setReplyToId(null);
  };

  const handleQuickVote = (option: IdeaVoteOption) => {
    voteIdea(idea.id, option, voteComment.trim() || undefined);
    setVoteComment('');
  };

  const handleStatusChange = (newStatus: IdeaStatus) => {
    updateIdea(idea.id, { status: newStatus });
    if (newStatus === 'approved') {
      triggerCelebration();
    }
  };

  const getStatusLabel = (status: IdeaStatus) => {
    const map: Record<IdeaStatus, string> = {
      draft: 'پیش‌نویس اولیه',
      submitted: 'ثبت شده / در انتظار بررسی',
      under_review: 'در حال ارزیابی و رأی‌گیری',
      needs_info: 'نیازمند اطلاعات تکمیلی',
      approved: 'تأیید شده برای اجرا',
      rejected: 'رد شده / خاتمه یافته',
      in_progress: 'در حال پیاده‌سازی',
      implemented: 'پیاده‌سازی‌شده',
      completed: 'خاتمه یافته / به نتیجه رسیده'
    };
    return map[status] || status;
  };

  const emojiList = ['👍', '👏', '💡', '🔥', '❤️', '🚀'];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-slate-200 text-slate-800">
                {idea.code}
              </span>
              
              {/* Status Selector */}
              {hasPermission('thinktank_evaluate') ? (
                <select
                  value={idea.status}
                  onChange={(e) => handleStatusChange(e.target.value as IdeaStatus)}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 shadow-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="submitted">ثبت شده (در انتظار بررسی)</option>
                  <option value="under_review">در حال ارزیابی و رأی‌گیری</option>
                  <option value="approved">تأیید شده برای اجرا</option>
                  <option value="in_progress">در حال پیاده‌سازی</option>
                  <option value="rejected">رد شده / عدم تأیید</option>
                  <option value="completed">خاتمه یافته</option>
                </select>
              ) : (
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {getStatusLabel(idea.status)}
                </span>
              )}

              {idea.priority && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  {idea.priority === 'urgent' ? 'فوری' : idea.priority === 'high' ? 'اولویت بالا' : 'اولویت عادی'}
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold text-slate-900 leading-snug">
              {idea.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Conversion banner if converted */}
          {idea.convertedProjectId && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="font-bold">این ایده به عنوان یک پروژه سازمانی در حال اجراست</div>
                  <div className="text-emerald-700">پروژه: {convertedProject?.name || 'پروژه سازمانی'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Metadata Badges Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
              {creator && <Avatar user={creator} size="sm" />}
              <div>
                <div className="text-[11px] text-slate-400">طراح و پیشنهاددهنده</div>
                <div className="text-xs font-bold text-slate-800">{creator?.name || 'کاربر تدبیر'}</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
              <Building className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-[11px] text-slate-400">واحد سازمانی هدف</div>
                <div className="text-xs font-bold text-slate-800">{idea.targetDepartment || 'عمومی'}</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
              <DollarSign className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-[11px] text-slate-400">برآورد بودجه</div>
                <div className="text-xs font-bold text-slate-800">{idea.estimatedBudget || 'نامشخص'}</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-[11px] text-slate-400">برآورد زمان و تلاش</div>
                <div className="text-xs font-bold text-slate-800">{idea.estimatedEffort || 'نامشخص'}</div>
              </div>
            </div>
          </div>

          {/* Core Content: Problem Statement & Proposed Solution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80">
              <div className="flex items-center gap-2 font-bold text-amber-900 text-sm mb-2">
                <Lightbulb className="w-4 h-4 text-amber-600" />
                <span>مسئله و چالش شناسایی‌شده</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {idea.problemSolved}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm mb-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>راه‌حل و شیوه پیشنهادی حل مسئله</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {idea.proposedSolution}
              </p>
            </div>
          </div>

          {/* Description if provided */}
          {idea.description && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <h4 className="text-xs font-bold text-slate-500 mb-1.5">توضیحات و جزئیات تکمیلی:</h4>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {idea.description}
              </p>
            </div>
          )}

          {/* Voting Action Section */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white shadow-lg">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  <span>ارزیابی و رأی‌گیری سازمانی</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  رأی و تحلیل خود را درباره میزان اثرگذاری و امکان‌پذیری این ایده ثبت کنید.
                </p>
              </div>

              {/* Progress Summary */}
              <div className="bg-white/10 px-4 py-2 rounded-xl text-left">
                <div className="text-xl font-mono font-black text-emerald-400">{agreePercent}٪</div>
                <div className="text-[11px] text-slate-300">شاخص موافقت ({totalVotes} رأی)</div>
              </div>
            </div>

            {/* Voting Bar */}
            <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden flex mb-4">
              <div 
                style={{ width: `${totalVotes > 0 ? (agreeVotes.length / totalVotes) * 100 : 0}%` }} 
                className="h-full bg-emerald-500 transition-all duration-300"
              />
              <div 
                style={{ width: `${totalVotes > 0 ? (investigateVotes.length / totalVotes) * 100 : 0}%` }} 
                className="h-full bg-amber-400 transition-all duration-300"
              />
              <div 
                style={{ width: `${totalVotes > 0 ? (disagreeVotes.length / totalVotes) * 100 : 0}%` }} 
                className="h-full bg-rose-500 transition-all duration-300"
              />
            </div>

            {/* Vote Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => handleQuickVote('agree')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  currentUserVote?.option === 'agree' 
                    ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 shadow-md' 
                    : 'bg-white/15 hover:bg-emerald-600 text-white'
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
                <span>موافقم و پیشنهاد اجرا دارم ({agreeVotes.length})</span>
              </button>

              <button
                onClick={() => handleQuickVote('needs_investigation')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  currentUserVote?.option === 'needs_investigation' 
                    ? 'bg-amber-500 text-white ring-2 ring-amber-300 shadow-md' 
                    : 'bg-white/15 hover:bg-amber-600 text-white'
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>نیاز به بررسی بیشتر ({investigateVotes.length})</span>
              </button>

              <button
                onClick={() => handleQuickVote('disagree')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  currentUserVote?.option === 'disagree' 
                    ? 'bg-rose-600 text-white ring-2 ring-rose-300 shadow-md' 
                    : 'bg-white/15 hover:bg-rose-600 text-white'
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
                <span>مخالفم ({disagreeVotes.length})</span>
              </button>
            </div>
          </div>

          {/* Interactive Organizational Poll (if exists) */}
          {idea.hasPoll && idea.pollOptions && (
            <div className="p-5 rounded-xl bg-purple-50/70 border border-purple-200">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
                  <BarChart2 className="w-4 h-4 text-purple-700" />
                  <span>نظرسنجی ویژه اتاق فکر: {idea.pollQuestion || 'پرسش ارزیابی ایده'}</span>
                </div>
              </div>

              <div className="space-y-3">
                {idea.pollOptions.map((opt) => {
                  const totalPollVotes = idea.pollOptions?.reduce((acc, o) => acc + o.votes.length, 0) || 0;
                  const optPercent = totalPollVotes > 0 ? Math.round((opt.votes.length / totalPollVotes) * 100) : 0;
                  const isVoted = opt.votes.includes(currentUser.id);

                  return (
                    <div 
                      key={opt.id}
                      onClick={() => votePollOption(idea.id, opt.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                        isVoted 
                          ? 'border-purple-600 bg-purple-100/70 shadow-xs' 
                          : 'border-slate-200 bg-white hover:border-purple-300'
                      }`}
                    >
                      {/* Percent Fill Background */}
                      <div 
                        style={{ width: `${optPercent}%` }}
                        className="absolute inset-y-0 right-0 bg-purple-200/40 pointer-events-none transition-all duration-300"
                      />

                      <div className="relative flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isVoted ? 'border-purple-700 bg-purple-700 text-white' : 'border-slate-300'
                          }`}>
                            {isVoted && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          <span className="font-medium text-slate-800">{opt.text}</span>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span className="text-slate-500 font-medium">{opt.votes.length} رأی</span>
                          <span className="font-bold text-purple-800">{optPercent}٪</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sub-tabs: Discussions, Registered Votes, Timeline */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-4">
              <button
                onClick={() => setActiveTab('discussion')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === 'discussion'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>بحث و گفتگوی اعضا ({idea.comments.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('votes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === 'votes'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>آرا و تحلیل‌های ثبت‌شده ({idea.votes.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('timeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === 'timeline'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>تاریخچه رویدادها ({idea.activities?.length || 0})</span>
              </button>
            </div>

            {/* Tab: Discussion Comments */}
            {activeTab === 'discussion' && (
              <div className="space-y-4">
                {/* Comments List */}
                <div className="space-y-3">
                  {idea.comments.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      هنوز دیدگاهی ثبت نشده است. اولین نفری باشید که نظر می‌دهد!
                    </div>
                  ) : (
                    idea.comments.map((comment) => {
                      const author = users.find(u => u.id === comment.userId);
                      return (
                        <div key={comment.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                          {/* Replied text if present */}
                          {comment.replyToAuthor && (
                            <div className="mb-2 p-2 bg-slate-100 rounded-lg text-[11px] text-slate-500 border-r-2 border-indigo-500 flex items-center gap-1">
                              <CornerDownLeft className="w-3 h-3 text-indigo-500" />
                              <span className="font-semibold text-slate-700">{comment.replyToAuthor}:</span>
                              <span className="line-clamp-1">{comment.replyToText}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {author && <Avatar user={author} size="sm" />}
                              <div>
                                <span className="font-bold text-xs text-slate-800">{author?.name}</span>
                                <span className="text-[10px] text-slate-400 mr-2">{comment.timestamp}</span>
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                setReplyToId(comment.id);
                              }}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                            >
                              <CornerDownLeft className="w-3 h-3" />
                              پاسخ
                            </button>
                          </div>

                          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pr-8">
                            {comment.text}
                          </p>

                          {/* Emoji Reactions Bar */}
                          <div className="flex items-center gap-1.5 mt-2 pr-8 flex-wrap">
                            {comment.reactions?.map((rx, idx) => (
                              <button
                                key={idx}
                                onClick={() => toggleIdeaCommentReaction(idea.id, comment.id, rx.emoji)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                                  rx.userIds.includes(currentUser.id)
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                    : 'bg-white border-slate-200 text-slate-600'
                                }`}
                              >
                                <span>{rx.emoji}</span>
                                <span className="text-[11px] font-mono">{rx.count}</span>
                              </button>
                            ))}

                            <div className="flex items-center gap-1 opacity-70 hover:opacity-100">
                              {emojiList.slice(0, 4).map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleIdeaCommentReaction(idea.id, comment.id, emoji)}
                                  className="text-xs p-1 hover:bg-slate-200 rounded transition-colors"
                                  title={`افزودن ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Comment Input Box */}
                <form onSubmit={handleSendComment} className="pt-2">
                  {replyToId && (
                    <div className="flex items-center justify-between text-xs bg-indigo-50 p-2 rounded-t-xl border border-indigo-200 text-indigo-800">
                      <span>در حال پاسخ به دیدگاه...</span>
                      <button 
                        type="button" 
                        onClick={() => setReplyToId(null)}
                        className="text-indigo-600 hover:text-indigo-900 font-bold"
                      >
                        لغو پاسخ
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="دیدگاه، تحلیل کارشناسی یا پیشنهاد تکمیلی خود را بنویسید..."
                      className="flex-1 bg-transparent text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none px-2"
                    />
                    <button
                      type="submit"
                      disabled={!commentText.trim()}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      <span>ارسال</span>
                      <Send className="w-3.5 h-3.5 rotate-180" />
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Tab: Registered Votes List */}
            {activeTab === 'votes' && (
              <div className="space-y-3">
                {idea.votes.map((vote) => {
                  const voter = users.find(u => u.id === vote.userId);
                  const optionDetails = {
                    agree: { label: 'موافق با اجرا', color: 'bg-emerald-100 text-emerald-800', icon: ThumbsUp },
                    disagree: { label: 'مخالف', color: 'bg-rose-100 text-rose-800', icon: ThumbsDown },
                    needs_investigation: { label: 'بررسی بیشتر', color: 'bg-amber-100 text-amber-800', icon: HelpCircle }
                  }[vote.option];

                  const Icon = optionDetails.icon;

                  return (
                    <div key={vote.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3 text-xs">
                      <div className="flex items-start gap-2.5">
                        {voter && <Avatar user={voter} size="sm" />}
                        <div>
                          <div className="font-bold text-slate-800">{voter?.name}</div>
                          <div className="text-[11px] text-slate-400">{vote.timestamp}</div>
                          {vote.comment && (
                            <p className="mt-1 text-slate-600 bg-white p-2 rounded-lg border border-slate-100 text-xs">
                              {vote.comment}
                            </p>
                          )}
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${optionDetails.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {optionDetails.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab: Timeline / Activities */}
            {activeTab === 'timeline' && (
              <div className="space-y-3">
                {idea.activities?.map((act) => {
                  const actor = users.find(u => u.id === act.userId);
                  return (
                    <div key={act.id} className="flex items-start gap-3 text-xs p-3 rounded-xl bg-slate-50 border border-slate-100">
                      {actor && <Avatar user={actor} size="sm" />}
                      <div className="flex-1">
                        <span className="font-bold text-slate-800">{actor?.name} </span>
                        <span className="text-slate-600">{act.action}</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">{act.timestamp}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions: Convert to Project / Convert to Task / Direct Chat / Delete */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {creator && creator.id !== currentUser.id && (
              <button
                onClick={() => {
                  startDirectChatWithUser(creator.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-indigo-600" />
                گفتگو با طراح ایده
              </button>
            )}

            {(currentUser.role === 'admin' || currentUser.role === 'project_manager' || idea.creatorId === currentUser.id) && (
              <button
                onClick={() => {
                  if (window.confirm(`آیا از حذف ایده «${idea.title}» اطمینان دارید؟`)) {
                    deleteIdea(idea.id);
                    onClose();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                حذف ایده
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasPermission('thinktank_convert') && (
              <>
                <button
                  onClick={() => onOpenConvertToTask(idea)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs transition-colors cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4" />
                  تبدیل به Task
                </button>

                <button
                  onClick={() => onOpenConvertToProject(idea)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors cursor-pointer"
                >
                  <FolderKanban className="w-4 h-4" />
                  تبدیل به پروژه سازمانی
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
