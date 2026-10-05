import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { projectsApi, tasksApi, contentsApi, usersApi, rolesApi, notificationsApi, settingsApi } from '../api';
import type { CreateProjectPayload, UpdateProjectPayload } from '../api/projects';
import type { CreateTaskPayload, UpdateTaskPayload } from '../api/tasks';
import { workspaceKey } from './queryClient';
import { runtime } from '../config/runtime';
function useResource<T>(name: string, fetch: () => Promise<{ data: T }>) {
  const { currentUser, isLoggedIn } = useAuth();
  return useQuery({ queryKey: workspaceKey(currentUser.id, name), queryFn: async () => (await fetch()).data, enabled: isLoggedIn && !runtime.demoMode });
}
function useEntity<T>(name: string, id: string, fetch: (signal: AbortSignal) => Promise<{ data: T }>) {
  const { currentUser, isLoggedIn } = useAuth();
  return useQuery({ queryKey: ['entity', currentUser.id, name, id], queryFn: async ({ signal }) => (await fetch(signal)).data, enabled: isLoggedIn && !!id && !runtime.demoMode });
}
function useWrite<T, R>(_name: string, write: (input: T) => Promise<R>) {
  // request() performs one centralized, dependency-aware cache invalidation.
  return useMutation({ mutationFn: write });
}
export const useProjects = () => useResource('projects', () => projectsApi.list({ per_page: 100 }));
export const useProject = (id: string) => useEntity('projects', id, signal => projectsApi.get(id, signal));
export const useCreateProject = () => useWrite('projects', (data: CreateProjectPayload) => projectsApi.create(data));
export const useUpdateProject = () => useWrite('projects', ({ id, data }: { id: string; data: UpdateProjectPayload }) => projectsApi.update(id, data));
export const useTasks = () => useResource('tasks', () => tasksApi.list({ per_page: 100 }));
export const useTask = (id: string) => useEntity('tasks', id, signal => tasksApi.get(id, signal));
export const useCreateTask = () => useWrite('tasks', (data: CreateTaskPayload) => tasksApi.create(data));
export const useUpdateTask = () => useWrite('tasks', ({ id, data }: { id: string; data: UpdateTaskPayload }) => tasksApi.update(id, data));
export const useContents = () => useResource('contents', contentsApi.list);
export const useContent = (id: string) => useEntity('contents', id, signal => contentsApi.get(id, signal));
export const useUsers = () => useResource('users', usersApi.list);
export const useRoles = () => useResource('roles', rolesApi.list);
export const useNotifications = () => useResource('notifications', notificationsApi.list);
export const useSettings = () => useResource('settings', settingsApi.all);
