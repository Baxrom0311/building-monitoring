// Tizim rollari va kommunal idora rollari yordamchilari

export type UtilityKind = 'water' | 'gas' | 'electricity'

export const ORG_ROLE_UTILITY: Record<string, UtilityKind> = {
  water_org: 'water',
  gas_org: 'gas',
  electricity_org: 'electricity',
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  user: 'Foydalanuvchi',
  viewer: 'Kuzatuvchi',
  water_org: 'Suv idorasi',
  gas_org: 'Gaz idorasi',
  electricity_org: 'Elektr idorasi',
}

export const ALL_ROLES = ['admin', 'user', 'viewer', 'water_org', 'gas_org', 'electricity_org'] as const

/** Kommunal idora roli bo'lsa — qaysi tur (aks holda null) */
export function orgUtility(role?: string | null): UtilityKind | null {
  return role ? (ORG_ROLE_UTILITY[role] ?? null) : null
}

/** Login dan keyingi bosh sahifa (idora operatorlari → o'z sahifasi) */
export function roleHomePath(role?: string | null): string {
  const u = orgUtility(role)
  return u ? `/billing/${u}` : '/dashboard'
}
