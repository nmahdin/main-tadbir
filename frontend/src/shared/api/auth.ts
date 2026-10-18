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
      cache: 'no-store',
      body: payload,
    });
  },

  async requestBaleCode(login: string, purpose: 'login' | 'password_reset') {
    await initSanctum();
    return request<{ message: string; expires_in: number }>('/auth/bale/code', {
      method: 'POST', cache: 'no-store', body: { login, purpose },
    });
  },

  async loginWithBale(login: string, code: string, remember = false): Promise<ApiResponse<User>> {
    await initSanctum();
    return request<ApiResponse<User>>('/auth/bale/login', {
      method: 'POST', cache: 'no-store', body: { login, code, remember },
    });
  },

  async loginFromBalePanel(token: string): Promise<ApiResponse<User>> {
    await initSanctum();
    return request<ApiResponse<User>>('/auth/bale/panel', {
      method: 'POST', cache: 'no-store', body: { token },
    });
  },

  async resetPasswordWithBale(payload: { login: string; code: string; password: string; password_confirmation: string }) {
    await initSanctum();
    return request<{ message: string }>('/auth/bale/password/reset', {
      method: 'POST', cache: 'no-store', body: payload,
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
    return request<ApiResponse<User>>('/auth/me', { cache: 'no-store' });
  },

  async logout() {
    await initSanctum();
    return request<void>('/auth/logout', { method: 'POST', cache: 'no-store' });
  },

};
