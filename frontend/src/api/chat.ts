import { ChatAttachment, ChatMessage, Conversation } from '../types';
import { ApiCollection, ApiResponse, request, uploadRequest } from './client';

export const chatApi = {
  conversations: {
    list() {
      return request<ApiCollection<Conversation>>('/chat/conversations?per_page=200');
    },
    create(payload: Partial<Conversation> & { name: string; type: string; memberIds: string[] }) {
      return request<ApiResponse<Conversation>>('/chat/conversations', { method: 'POST', body: payload });
    },
    update(id: string, payload: Partial<Conversation>) {
      return request<ApiResponse<Conversation>>(`/chat/conversations/${id}`, { method: 'PUT', body: payload });
    },
    remove(id: string) {
      return request<void>(`/chat/conversations/${id}`, { method: 'DELETE' });
    },
  },

  messages: {
    list() {
      return request<ApiCollection<ChatMessage>>('/chat/messages?per_page=200');
    },
    create(payload: Partial<ChatMessage> & { conversationId: string; senderId: string; text: string }) {
      return request<ApiResponse<ChatMessage>>('/chat/messages', { method: 'POST', body: payload });
    },
    update(id: string, payload: Partial<ChatMessage>) {
      return request<ApiResponse<ChatMessage>>(`/chat/messages/${id}`, { method: 'PUT', body: payload });
    },
    remove(id: string) {
      return request<void>(`/chat/messages/${id}`, { method: 'DELETE' });
    },
    command(id: string, command: 'toggle_reaction' | 'toggle_pin' | 'toggle_star', emoji?: string) {
      return request<ApiResponse<ChatMessage>>(`/chat/messages/${id}`, { method: 'PATCH', body: { command, ...(emoji ? { emoji } : {}) } });
    },
  },

  commandConversation(id: string, command: 'toggle_mute' | 'mark_read' | 'mark_unread') {
    return request<ApiResponse<Conversation>>(`/chat/conversations/${id}`, { method: 'PATCH', body: { command } });
  },

  realtime: {
    status(conversationId: string) {
      return request<ApiResponse<{ conversationId: string; onlineUsers: Array<{ id: string; name?: string }>; typingUsers: Array<{ id: string; name?: string }>; transport: string; serverTime: string }>>(`/chat/conversations/${conversationId}/realtime`);
    },
    heartbeat(conversationId: string, typing = false) {
      return request<ApiResponse<{ conversationId: string; onlineUsers: Array<{ id: string; name?: string }>; typingUsers: Array<{ id: string; name?: string }>; transport: string; serverTime: string }>>(`/chat/conversations/${conversationId}/realtime`, { method: 'POST', body: { typing } });
    },
  },

  uploadAttachment(conversationId: string, file: File, voice = false) {
    const body = new FormData();
    body.append('file', file);
    if (voice) body.append('voice', '1');
    return uploadRequest<ApiResponse<ChatAttachment>>(`/chat/conversations/${conversationId}/attachments`, body);
  },
};
