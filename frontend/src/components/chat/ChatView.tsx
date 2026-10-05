import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { ConversationList } from './ConversationList';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ConversationInfoDrawer } from './ConversationInfoDrawer';
import { CreateChatModal } from './CreateChatModal';
import { ChatMessage } from '../../types';
import { Avatar } from '../common/Avatar';
import { ModuleErrorBanner } from '../common/Feedback';
import { IconButton } from '../common/Primitives';
import { connectChatRealtime, type ChatRealtimeState } from '../../api/chatRealtime';
import {
  MessageSquare,
  Info,
  Pin,
  ArrowRight,
  Hash,
  Users,
  FolderKanban,
  Search,
  ChevronUp,
  ChevronDown,
  X
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [realtime, setRealtime] = useState<ChatRealtimeState>({ onlineUsers: [], typingUsers: [], transport: 'polling-fallback' });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<ReturnType<typeof connectChatRealtime> | null>(null);
  
  useEffect(() => {
    if (window.innerWidth < 768) {
      setActiveConversationId(null);
    }
  }, [setActiveConversationId]);

  
  useEffect(() => {
    if (activeConversationId) {
      markConversationAsRead(activeConversationId);
    }
    // Marking read updates provider state; depend only on the selected id to avoid a command loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  useEffect(() => {
    realtimeRef.current?.close();
    realtimeRef.current = null;
    setRealtime({ onlineUsers: [], typingUsers: [], transport: 'polling-fallback' });
    if (!activeConversationId || !/^\d+$/.test(activeConversationId)) return;
    const connection = connectChatRealtime(activeConversationId, setRealtime);
    realtimeRef.current = connection;
    return () => { connection.close(); if (realtimeRef.current === connection) realtimeRef.current = null; };
  }, [activeConversationId]);

  // Auto-scroll to bottom when messages in active conversation change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeConversationId]);

  // Removed auto-select to allow mobile to see the list first

  const activeMessages = messages.filter(message => activeConversation && message.conversationId === activeConversation.id);

  const getRecipientInfo = () => {
    if (!activeConversation) return null;
    if (activeConversation.type === 'direct') {
      const otherUserId = activeConversation.memberIds.find(id => id !== currentUser.id) || activeConversation.memberIds[0];
      const otherUser = users.find(u => u.id === otherUserId);
      const isOnline = realtime.onlineUsers.some(user => user.id === otherUserId) || Boolean(otherUser?.isOnline);
      const isTyping = realtime.typingUsers.some(user => user.id === otherUserId);
      return {
        name: otherUser?.name || activeConversation.name,
        user: otherUser,
        isOnline,
        subtitle: isTyping ? 'در حال نوشتن…' : isOnline ? 'آنلاین در سامانه' : `آخرین بازدید: ${otherUser?.lastActive || 'امروز'}`
      };
    }
    return {
      name: activeConversation.name,
      user: undefined,
      isOnline: false,
      subtitle: realtime.typingUsers.length ? `${realtime.typingUsers.map(user => user.name).filter(Boolean).join('، ')} در حال نوشتن…` : `${activeConversation.memberIds.length} عضو · ${realtime.onlineUsers.length.toLocaleString('fa-IR')} آنلاین`
    };
  };

  const recipientInfo = getRecipientInfo();
  const linkedProject = activeConversation?.projectId ? projects.find(p => p.id === activeConversation.projectId) : null;
  const pinnedMessages = activeMessages.filter(m => m.isPinned);
  const activePinned = pinnedMessages.length ? pinnedMessages[pinnedIndex % pinnedMessages.length] : null;
  const searchResults = messageSearch.trim() ? activeMessages.filter(message => message.text?.toLocaleLowerCase('fa-IR').includes(messageSearch.trim().toLocaleLowerCase('fa-IR'))) : [];
  const jumpToMessage = (id: string) => {
    const element = document.getElementById(`msg-${id}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.classList.add('ring-2', 'ring-amber-400');
    window.setTimeout(() => element?.classList.remove('ring-2', 'ring-amber-400'), 1600);
  };
  const moveSearch = (direction: number) => {
    if (!searchResults.length) return;
    const next = (searchIndex + direction + searchResults.length) % searchResults.length;
    setSearchIndex(next);
    jumpToMessage(searchResults[next].id);
  };
  const handleTypingChange = useCallback((typing: boolean) => realtimeRef.current?.typing(typing), []);
  const movePinned = (direction: number) => {
    if (!pinnedMessages.length) return;
    const next = (pinnedIndex + direction + pinnedMessages.length) % pinnedMessages.length;
    setPinnedIndex(next);
    jumpToMessage(pinnedMessages[next].id);
  };

  return (
    <div className="relative h-[calc(100vh-64px)] w-full flex overflow-hidden bg-slate-100 text-right" dir="rtl">
      {/* بنر خطا روی فریم می‌نشیند و عرض/فاصلهٔ ستون‌های گفتگو را تغییر نمی‌دهد. */}
      <ModuleErrorBanner modules={['conversations', 'messages']} label="گفتگوها" className="absolute top-3 inset-x-3 z-30 shadow-lg" />

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
              <IconButton
                label="بازگشت به فهرست گفتگوها"
                purpose="back"
                variant="secondary"
                onClick={() => setActiveConversationId(null)}
                className="md:hidden"
              >
                <ArrowRight className="w-5 h-5" />
              </IconButton>

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
                      <span>{linkedProject.name}</span>
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
              <button onClick={() => setSearchOpen(open => !open)} title="جست‌وجو در این گفتگو" className={`rounded-xl p-2 transition-colors ${searchOpen ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}><Search className="h-4 w-4" /></button>
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

          {searchOpen && <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={messageSearch} onChange={event => { setMessageSearch(event.target.value); setSearchIndex(0); }} onKeyDown={event => { if (event.key === 'Enter') moveSearch(event.shiftKey ? -1 : 1); }} placeholder="جست‌وجو در متن پیام‌های این گفتگو…" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pr-9 pl-3 text-xs outline-none focus:border-indigo-400" /></div><span className="shrink-0 text-[10px] font-bold text-slate-500">{searchResults.length ? `${(searchIndex + 1).toLocaleString('fa-IR')} از ${searchResults.length.toLocaleString('fa-IR')}` : 'بدون نتیجه'}</span><button type="button" disabled={!searchResults.length} onClick={() => moveSearch(-1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button><button type="button" disabled={!searchResults.length} onClick={() => moveSearch(1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button><button type="button" onClick={() => { setSearchOpen(false); setMessageSearch(''); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>}

          {/* Pinned Messages Banner */}
          {pinnedMessages.length > 0 && (
            <div className="bg-amber-50/90 border-b border-amber-200/80 px-4 py-2 flex items-center justify-between gap-2 text-xs text-amber-900">
              <button type="button" onClick={() => activePinned && jumpToMessage(activePinned.id)} className="flex min-w-0 flex-1 items-center gap-2 truncate text-right">
                <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="font-bold shrink-0">پین‌شده {(pinnedIndex % pinnedMessages.length + 1).toLocaleString('fa-IR')} از {pinnedMessages.length.toLocaleString('fa-IR')}:</span>
                <span className="truncate">{activePinned?.text || 'پیام پیوست‌دار'}</span>
              </button>
              <button type="button" onClick={() => movePinned(-1)} className="rounded-lg p-1.5 hover:bg-amber-100" aria-label="پیام پین‌شده قبلی"><ChevronUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => movePinned(1)} className="rounded-lg p-1.5 hover:bg-amber-100" aria-label="پیام پین‌شده بعدی"><ChevronDown className="h-3.5 w-3.5" /></button>
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
            onTypingChange={handleTypingChange}
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
            یک گفتگو را از لیست سمت راست انتخاب کرده یا گفتگوی جدیدی با همکاران، دپارتمان‌ها یا پیرامون پروژه‌ها آغاز کنید.
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
