import * as records from './initialData';
import * as assets from './initialAssets';
import * as chat from './initialChatData';
import { runtime } from '../config/runtime';
// Demo is explicit, in-memory and read-only. API errors never activate it.
const onlyDemo = <T,>(data: T[]): T[] => runtime.demoMode ? data : [];
export const demo = {
  users: onlyDemo(records.INITIAL_USERS.map(user => ({ ...user, permissions: records.INITIAL_ROLES.find(role => role.id === user.roleId || role.key === user.role)?.permissions ?? [] }))), roles: onlyDemo(records.INITIAL_ROLES.map(role => ({ ...role, isActive: role.isActive ?? true }))),
  projects: onlyDemo(records.INITIAL_PROJECTS), tasks: onlyDemo(records.INITIAL_TASKS),
  contents: onlyDemo(records.INITIAL_CONTENTS), notifications: onlyDemo(records.INITIAL_NOTIFICATIONS),
  templates: onlyDemo(records.INITIAL_TEMPLATES), activities: onlyDemo(records.INITIAL_ACTIVITIES),
  workflows: onlyDemo(records.INITIAL_WORKFLOWS), categories: onlyDemo(records.INITIAL_CATEGORIES),
  processTemplates: onlyDemo(records.INITIAL_PROCESS_TEMPLATES), publishingPlatforms: onlyDemo(records.INITIAL_PUBLISHING_PLATFORMS),
  folders: onlyDemo(assets.INITIAL_FOLDERS), assets: onlyDemo(assets.INITIAL_ASSETS),
  conversations: onlyDemo(chat.INITIAL_CONVERSATIONS), messages: onlyDemo(chat.INITIAL_MESSAGES),
};
