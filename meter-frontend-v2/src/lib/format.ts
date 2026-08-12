// Raqam / birlik / sana formatlash — YAGONA manba. Ilgari 135+ joyda xom toFixe()
// ishlatilardi (mingliklar ajratkichisiz, har xil). Intl orqali uz-UZ ko'rinishi.

const nf = (maxFractionDigits: number) =>
  new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: maxFractionDigits })

/** Raqamni mingliklar ajratkichi bilan formatlaydi. null/undefined/NaN -> "—". */
export function formatNumber(value: number | null | undefined, maxFractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return nf(maxFractionDigits).format(value)
}

/** Qiymat + birlik ("220 V", "2.5 bar"). null -> "—". */
export function formatValue(
  value: number | null | undefined,
  unit?: string,
  maxFractionDigits = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const num = nf(maxFractionDigits).format(value)
  return unit ? `${num} ${unit}` : num
}

/** epoch soniya -> "12.08.2026 22:11" */
export function formatDateTime(tsSeconds: number | null | undefined): string {
  if (!tsSeconds) return '—'
  return new Date(tsSeconds * 1000).toLocaleString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** epoch soniya -> "12.08.2026" */
export function formatDate(tsSeconds: number | null | undefined): string {
  if (!tsSeconds) return '—'
  return new Date(tsSeconds * 1000).toLocaleDateString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/** epoch soniya -> "22:11" */
export function formatTime(tsSeconds: number | null | undefined): string {
  if (!tsSeconds) return '—'
  return new Date(tsSeconds * 1000).toLocaleTimeString('uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "3 daqiqa oldin" kabi nisbiy vaqt (epoch soniya). */
export function formatRelative(tsSeconds: number | null | undefined): string {
  if (!tsSeconds) return '—'
  const diff = Math.floor(Date.now() / 1000) - tsSeconds
  if (diff < 60) return 'hozirgina'
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`
  return `${Math.floor(diff / 86400)} kun oldin`
}
