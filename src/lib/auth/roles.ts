import type { AuthUser } from "@/lib/auth/session";

const roleRank = {
  SALES_AGENT: 1,
  SALES_MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
} as const;

export type AppRole = keyof typeof roleRank;

export function hasRole(user: AuthUser, minimumRole: AppRole) {
  return rank(user.role) >= roleRank[minimumRole];
}

export function canManageCompanySettings(user: AuthUser) {
  return hasRole(user, "ADMIN");
}

export function canManageKnowledge(user: AuthUser) {
  return hasRole(user, "SALES_MANAGER");
}

export function canManageDeals(user: AuthUser) {
  return hasRole(user, "SALES_MANAGER");
}

function rank(role: string) {
  return roleRank[role as AppRole] ?? 0;
}
