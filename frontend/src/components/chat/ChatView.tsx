import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ConversationList } from './ConversationList';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ConversationInfoDrawer } from './ConversationInfoDrawer';
import { CreateChatModal } from './CreateChatModal';
import { ChatMessage, Conversation } from '../../types';
import { Avatar } from '../common/Avatar';
import {
  MessageSquare,
  Search,
  Info,
  MoreVertical,
  Pin,
  ArrowRight,
  Hash,
  Users,
  FolderKanban,
  ExternalLink,
  ChevronDown
} from 'lucide-react';

export const ChatView: React.FC = () => {
  const {
    conversations,
    messages,
    activeConversationId,
    setActiveConversationId,
    markConversationAsRead,
    currentUser,
    users,
    projects,
    setSelectedProjectId,
    setActiveView
  } = useApp();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [searchInChat, setSearchInChat] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (window.innerWidth < 768) {
      setActiveConversationId(null);
    }
  }, [setActiveConversationId]);

  
  useEffect(() => {
    if (activeConversationId) {
      markConversationAsRead(activeConversationId);
    }
  }, [activeConversationId, markConversationAsRead]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);


  // Auto-scroll to bottom when messages in active conversation change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeConversationId]);

  // Removed auto-select to allow mobile to see the list first

  const activeMessages = messages.filter(m => {
    if (!activeConversation) return false;
    const matchesConv = m.conversationId === activeConversation.id;
    const matchesSearch = !searchInChat.trim() || m.text.toLowerCase().includes(searchInChat.toLowerCase());
    return matchesConv && matchesSearch;
  });

  const getRecipientInfo = () => {
    if (!activeConversation) return null;
    if (activeConversation.type === 'direct') {
      const otherUserId = activeConversation.memberIds.find(id => id !== currentUser.id) || activeConversation.memberIds[0];
      const otherUser = users.find(u => u.id === otherUserId);
      return {
        name: otherUser?.name || activeConversation.name,
        user: otherUser,
        isOnline: otherUser?.isOnline,
        subtitle: otherUser?.isOnline ? 'آنلاین در سامانه' : `آخرین بازدید: ${otherUser?.lastActive || 'امروز'}`
      };
    }
    return {
      name: activeConversation.name,
      user: undefined,
      isOnline: false,
      subtitle: `${activeConversation.memberIds.length} عضو در گروه`
    };
  };

  const recipientInfo = getRecipientInfo();
  const linkedProject = activeConversation?.projectId ? projects.find(p => p.id === activeConversation.projectId) : null;
  const pinnedMessages = activeMessages.filter(m => m.isPinned);

  return (
    <div className="h-[calc(100vh-64px)] w-full flex overflow-hidden bg-slate-100 text-right" dir="rtl">
      {/* 1. Conversations List Sidebar (Hidden on mobile if conversation is open) */}
      <div className={`w-full md:w-80 lg:w-96 shrink-0 h-full ${activeConversation ? 'hidden md:block' : 'block'}`}>
        <ConversationList onOpenCreateModal={() => setIsCreateModalOpen(true)} />
      </div>

      {/* 2. Active Chat Canvas */}
      {activeConversation ? (
        <div className="flex-1 flex flex-col h-full bg-slate-50 min-w-0">
          {/* Active Chat Header */}
          <div className="h-16 px-4 sm:px-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              {/* Back button on mobile */}
              <button
                onClick={() => setActiveConversationId(null)}
                className="md:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <ArrowRight className="w-5 h-5" />
              </button>

              {/* Avatar */}
              <div className="relative shrink-0">
                {activeConversation.type === 'direct' && recipientInfo?.user ? (
                  <Avatar user={recipientInfo.user} size="md" showTooltip={false} />
                ) : activeConversation.type === 'channel' ? (
                  <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                    <Hash className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Users className="w-5 h-5" />
                  </div>
                )}

                {activeConversation.type === 'direct' && recipientInfo?.isOnline && (
                  <span className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white" />
                )}
              </div>

              {/* Names & Subtitles */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
                    {recipientInfo?.name}
                  </h3>
                  {linkedProject && (
                    <button
                      onClick={() => {
                        setSelectedProjectId(linkedProject.id);
                        setActiveView('project-detail');
                      }}
                      className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 hover:bg-purple-100 transition-colors"
                    >
                      <FolderKanban className="w-3 h-3" />
                      <span>{linkedProject.name} [{linkedProject.key}]</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {recipientInfo?.subtitle}
                </p>
              </div>
            </div>

            {/* Header Tools */}
            <div className="flex items-center gap-1.5">
              {/* Search Toggle */}
              {isSearchOpen ? (
                <div className="relative animate-in fade-in zoom-in-95 duration-100">
                  <input
                    type="text"
                    autoFocus
                    value={searchInChat}
                    onChange={(e) => setSearchInChat(e.target.value)}
                    placeholder="جستجو در این چت..."
                    className="w-48 sm:w-64 pr-3 pl-8 py-1.5 text-xs bg-slate-100 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden"
                  />
                  <button
                    onClick={() => {
                      setSearchInChat('');
                      setIsSearchOpen(false);
                    }}
                    className="absolute left-2 top-2 text-slate-400 hover:text-slate-700 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsSearchOpen(true)}
                  title="جستجو در گفتگو"
                  className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}

              {/* Info Drawer Toggle */}
              <button
                onClick={() => setIsInfoDrawerOpen(!isInfoDrawerOpen)}
                title="اطلاعات و اعضا"
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isInfoDrawerOpen ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Pinned Messages Banner */}
          {pinnedMessages.length > 0 && (
            <div className="bg-amber-50/90 border-b border-amber-200/80 px-4 py-2 flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2 truncate">
                <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="font-bold shrink-0">پیام پین شده:</span>
                <span className="truncate">{pinnedMessages[pinnedMessages.length - 1].text}</span>
              </div>
              <button
                onClick={() => {
                  const lastPinned = pinnedMessages[pinnedMessages.length - 1];
                  const el = document.getElementById(`msg-${lastPinned.id}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="text-[11px] font-bold text-amber-700 hover:underline shrink-0 pr-2 cursor-pointer"
              >
                مشاهده
              </button>
            </div>
          )}

          {/* Messages Stream Container */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
            {activeMessages.length === 0 ? (
              <div className="py-24 text-center text-slate-400 text-xs">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">هنوز پیامی در این گفتگو ارسال نشده است.</p>
                <p className="text-[11px] text-slate-400 mt-1">اولین پیام را ارسال کنید یا تسک مرتبط را پیوست نمایید.</p>
              </div>
            ) : (
              activeMessages.map(msg => {
                const sender = users.find(u => u.id === msg.senderId);
                const isMe = msg.senderId === currentUser.id;

                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    sender={sender}
                    isMe={isMe}
                    onReply={(m) => setReplyingTo(m)}
                    onEdit={(m) => setEditingMessage(m)}
                  />
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Footer */}
          <MessageInput
            conversationId={activeConversation.id}
            replyingTo={replyingTo}
            editingMessage={editingMessage}
            onCancelReply={() => setReplyingTo(null)}
            onCancelEdit={() => setEditingMessage(null)}
          />
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 bg-slate-50 text-slate-500">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 mb-1">
            پیام‌رسانی و چت سازمانی تدبیر
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">
            یک گفتگو را از لیست سمت راست انتخاب کرده یا گفتگوی جدیدی با همکاران، تیم‌ها یا پیرامون پروژه‌ها آغاز کنید.
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
          >
            ایجاد گفتگوی جدید
          </button>
        </div>
      )}

      {/* 3. Conversation Details Drawer (Collapsible) */}
      {activeConversation && isInfoDrawerOpen && (
        <ConversationInfoDrawer
          conversation={activeConversation}
          isOpen={isInfoDrawerOpen}
          onClose={() => setIsInfoDrawerOpen(false)}
        />
      )}

      {/* Create Chat Modal */}
      <CreateChatModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
};
