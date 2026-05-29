export type AppRole = 'admin' | 'manager' | 'user' | string;

type RouteAccessRule = {
  prefix: string;
  roles: readonly AppRole[];
};

const ALL_ROLES = ['admin', 'manager', 'user'] as const;
const SUPERVISOR_ROLES = ['admin', 'manager'] as const;

export const ROUTE_ACCESS_RULES: readonly RouteAccessRule[] = [
  { prefix: '/dashboard', roles: SUPERVISOR_ROLES },
  { prefix: '/settings', roles: ['admin'] },
  { prefix: '/quotes', roles: SUPERVISOR_ROLES },
  { prefix: '/inventory', roles: SUPERVISOR_ROLES },
  { prefix: '/inbox', roles: ALL_ROLES },
  { prefix: '/contacts', roles: ALL_ROLES },
  { prefix: '/actions', roles: ALL_ROLES },
  { prefix: '/knowledge-base', roles: ALL_ROLES },
];

export function canAccessRoute(role: AppRole | null | undefined, pathname: string): boolean {
  if (!role) return false;

  const rule = ROUTE_ACCESS_RULES.find((item) => (
    pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)
  ));

  if (!rule) return true;
  return rule.roles.includes(role);
}
