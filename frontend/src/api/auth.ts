import { User } from '../types';
import { ApiResponse, initSanctum, request } from './client';

export interface LoginPayload {
  login: string;
  password: string;
  remember?: boolean;
}

export interface RegisterPayload {
  name: string;
  username: string;
  email: string;
  password: string;
  password_confirmation: string;
  phone?: string;
  department?: string;
  title?: string;
}

export const authApi = {
  async login(payload: LoginPayload): Promise<ApiResponse<User>> {
    await initSanctum();
    return request<ApiResponse<User>>('/auth/login', {
      method: 'POST',
      body: payload,
    });
  },

  async register(payload: RegisterPayload) {
    await initSanctum();
    return request<ApiResponse<User>>('/auth/register', {
      method: 'POST',
      body: payload,
    });
  },

  me() {
    return request<ApiResponse<User>>('/auth/me');
  },

  async logout() {
    await initSanctum();
    return request<void>('/auth/logout', { method: 'POST' });
  },

  async forgotPassword(email: string) {
    await initSanctum();
    return request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },
};
