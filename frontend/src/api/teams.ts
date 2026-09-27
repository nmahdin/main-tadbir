import { Team } from '../types';
import { ApiResponse, request } from './client';

export type TeamPayload = Partial<Omit<Team, 'id' | 'createdAt'>> & {
  name: string;
};

export const teamsApi = {
  list() {
    return request<ApiResponse<Team[]>>('/teams');
  },

  create(payload: TeamPayload) {
    return request<ApiResponse<Team>>('/teams', { method: 'POST', body: payload });
  },

  update(id: string, payload: Partial<TeamPayload>) {
    return request<ApiResponse<Team>>(`/teams/${id}`, { method: 'PUT', body: payload });
  },

  remove(id: string) {
    return request<void>(`/teams/${id}`, { method: 'DELETE' });
  },
};
