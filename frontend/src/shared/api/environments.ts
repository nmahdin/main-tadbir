import { request, type ApiResponse } from './client';
import type { EnvironmentsPayload } from '../lib/environments';

/**
 * UX-02-1 (K1) client for the read-only environment discovery
 * endpoint. The payload mirrors server-side C1–C3 visibility; it is
 * a navigation aid only and grants nothing.
 */
export const environmentsApi = {
  list() {
    return request<ApiResponse<EnvironmentsPayload>>('/core/environments');
  },
};
