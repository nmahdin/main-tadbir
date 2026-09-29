import { User } from '../types';
import { ApiCollection, ApiResponse, request } from './client';

export type UserDirectoryEntry = Pick<User, 'id' | 'name' | 'username' | 'avatar' | 'title'>;

export const usersApi = {
  list() {
    return request<ApiCollection<User>>('/users?per_page=100');
  },
  directory() {
    return request<ApiResponse<UserDirectoryEntry[]>>('/users/directory');
  },
  create(payload: Partial<User> & { name: string; username: string; password: string; password_confirmation: string }) {
    return request<ApiResponse<User>>('/users', { method: 'POST', body: payload });
  },
  update(id: string, payload: Partial<User> & { password_confirmation?: string }) {
    return request<ApiResponse<User>>(`/users/${id}`, { method: 'PATCH', body: payload });
  },
  uploadAvatar(id: string, file: File) {
    const body = new FormData();
    body.append('avatar', file);
    return request<ApiResponse<User>>(`/users/${id}/avatar`, { method: 'POST', body });
  },
  remove(id: string) {
    return request<void>(`/users/${id}`, { method: 'DELETE' });
  },
};
