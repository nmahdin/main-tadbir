import { ChatMessage, Conversation } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

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
  },
};
