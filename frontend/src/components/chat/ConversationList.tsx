import React from 'react';
import { useApp } from '../../context/AppContext';
import { Conversation, ChatFilterCategory } from '../../types';
import { Avatar } from '../common/Avatar';
import {
  MessageSquare,
  Users,
  Hash,
  Star,
  Search,
  Plus,
  Pin,
  VolumeX,
  Clock,
  Check,
  CheckCheck
} from 'lucide-react';

interface ConversationListProps {
  onOpenCreateModal: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({ onOpenCreateModal }) => {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    markConversationAsRead,
    markConversationAsUnread,
    chatFilter,
    setChatFilter,
    chatSearchQuery,
    setChatSearchQuery,
    currentUser,
    users,
    projects
  } = useApp();

  const filteredConversations = conversations.filter(conv => {
    // Filter by tab
    if (chatFilter === 'direct' && conv.type !== 'direct') return false;
    if (chatFilter === 'group' && conv.type !== 'group') return false;
    if (chatFilter === 'channel' && conv.type !== 'channel') return false;

    // Filter by search
    if (chatSearchQuery.trim()) {
      const q = chatSearchQuery.toLowerCase();
      const matchesName = conv.name.toLowerCase().includes(q);
      const matchesDesc = conv.description?.toLowerCase().includes(q);
      const matchesLastMsg = conv.lastMessage?.text.toLowerCase().includes(q);
      if (!matchesName && !matchesDesc && !matchesLastMsg) return false;
    }

    return true;
  });

  const getConversationDetails = (conv: Conversation) => {
    if (conv.type === 'direct') {
      const otherUserId = conv.memberIds.find(id => id !== currentUser.id) || conv.memberIds[0];
      const otherUser = users.find(u => u.id === otherUserId);
      return {
        name: otherUser?.name || conv.name,
        user: otherUser,
        isOnline: otherUser?.isOnline,
        avatar: otherUser?.avatar
      };
    }
    return {
      name: conv.name,
      user: undefined,
      isOnline: false,
      avatar: conv.avatar
    };
  };

  const getUnreadForMe = (conv: Conversation) => {
    if (!conv.unreadCount) return 0;
    return typeof conv.unreadCount === 'number' ? conv.unreadCount : 0;
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 text-right select-none" dir="rtl">
      {/* Header & Search */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                پیام‌ها و گفتگوها
              </h2>
            </div>
          </div>

          <button
            onClick={onOpenCreateModal}
            className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
            title="گفتگوی جدید"
          >
            <Plus className="w-4 h-4" />
            <span>چت جدید</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={chatSearchQuery}
            onChange={(e) => setChatSearchQuery(e.target.value)}
            placeholder="جستجو در گفتگوها و پیام‌ها..."
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl">
          <button
            onClick={() => setChatFilter('all')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
              chatFilter === 'all'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            همه
          </button>
          <button
            onClick={() => setChatFilter('direct')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
              chatFilter === 'direct'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            خصوصی
          </button>
          <button
            onClick={() => setChatFilter('group')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
              chatFilter === 'group'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            گروه‌ها
          </button>
          <button
            onClick={() => setChatFilter('channel')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
              chatFilter === 'channel'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            کانال‌ها
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredConversations.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs px-4">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300 opacity-60" />
            <p>هیچ گفتگویی با این فیلتر یافت نشد.</p>
            <button
              onClick={onOpenCreateModal}
              className="mt-3 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
            >
              شروع یک گفتگوی جدید
            </button>
          </div>
        ) : (
          filteredConversations.map(conv => {
            const isActive = activeConversationId === conv.id;
            const details = getConversationDetails(conv);
            const unread = getUnreadForMe(conv);

            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`p-3 rounded-2xl transition-all cursor-pointer relative group flex items-start gap-3 ${
                  isActive
                    ? 'bg-indigo-50/90 border border-indigo-200/80 shadow-2xs'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                {/* Avatar with status */}
                <div className="relative shrink-0">
                  {conv.type === 'direct' && details.user ? (
                    <Avatar user={details.user} size="md" showTooltip={false} />
                  ) : conv.type === 'channel' ? (
                    <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                      <Hash className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      <Users className="w-5 h-5" />
                    </div>
                  )}

                  {conv.type === 'direct' && details.isOnline && (
                    <span className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <h4 className={`text-xs font-bold truncate ${
                        isActive ? 'text-indigo-900' : 'text-slate-900'
                      }`}>
                        {details.name}
                      </h4>
                      {conv.isMuted && (
                        <VolumeX className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {conv.lastMessage?.timestamp || ''}
                    </span>
                  </div>
                  
                  {/* Last message preview */}
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-[11px] truncate leading-tight ${
                      unread > 0 ? 'text-slate-900 font-bold' : 'text-slate-500'
                    }`}>
                      {conv.lastMessage ? (
                        <span>
                          {conv.type !== 'direct' && conv.lastMessage.senderName ? `${conv.lastMessage.senderName}: ` : ''}
                          {conv.lastMessage.text}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">هنوز پیامی ارسال نشده است</span>
                      )}
                    </p>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Mark as read/unread button (shows on hover) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (unread > 0) markConversationAsRead(conv.id);
                          else markConversationAsUnread(conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-indigo-600 bg-white/80 rounded-lg hover:bg-indigo-50"
                        title={unread > 0 ? "علامت به عنوان خوانده شده" : "علامت به عنوان نخوانده"}
                      >
                        {unread > 0 ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                      </button>

                      {unread > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white shrink-0 font-mono flex items-center justify-center min-w-[1.25rem]">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
