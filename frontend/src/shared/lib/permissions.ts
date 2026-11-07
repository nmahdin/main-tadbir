/** UI affordances only. Backend authorization remains mandatory. */
export function canUsePermission(
  user: { contentMembershipAccess?: boolean; status?: string; role?: string | null; roleId?: string | null; roleIsActive?: boolean; permissions?: string[] },
  roles: { id: string; key: string; isActive?: boolean; permissions: string[] }[],
  permission: string,
): boolean {
  if (user.status !== 'active' || user.roleIsActive === false) return false;
  const role = user.roleId ? roles.find(r => r.id === user.roleId) : undefined;
  if (role && role.isActive !== true) return false;
  if (permission === 'content.view' && user.contentMembershipAccess === true) return true;
  if (role) return role.isActive === true && role.permissions.includes(permission);
  // An explicitly empty server grant is a denial, not an unloaded/demo fallback.
  return user.permissions?.includes(permission) === true;
}
