// ── Barcha sensor turlari uchun holat baholash tizimi ────────────────────────
// Har bir sensor o'z me'yoriy oraliqlariga ega:
//   A'lo (ideal), Norma (me'yorda), O'rta (ehtiyot), Yomon (xavf)

export type StatusLevel = 'alo' | 'norma' | 'orta' | 'yomon' | 'unknown'

export interface SensorStatusInfo {
  level: StatusLevel
  label: string       // "A'lo", "Norma", "Tinch", "Shovqinli" kabi
  color: string       // Rang kodi
  bgColor: string     // Fon rangi
  borderColor: string // Chegara rangi
}

// ── Elektr kuchlanishi (V) ──────────────────────────────────────────────────
export function getElectricityStatus(voltage: number | null): SensorStatusInfo {
  if (voltage == null) return unknownStatus()
  const dev = Math.abs(voltage - 220)
  if (dev <= 5) return { level: 'alo', label: 'Normal holat', color: '#34D399', bgColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.4)' }
  if (dev <= 15) return { level: 'norma', label: "Me'yorda", color: '#22D3EE', bgColor: 'rgba(34,211,238,0.15)', borderColor: 'rgba(34,211,238,0.4)' }
  if (dev <= 25) return { level: 'orta', label: 'Beqaror', color: '#FBBF24', bgColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.4)' }
  return { level: 'yomon', label: 'Xavfli!', color: '#FB7185', bgColor: 'rgba(251,113,133,0.2)', borderColor: 'rgba(251,113,133,0.5)' }
}

// ── Suv bosimi (bar) ────────────────────────────────────────────────────────
// Me'yor 2.25 bar (DisplayPage.tsx WATER_NOMINAL bilan bir xil — shu chegaralar
// getWaterColor() bilan mos bo'lishi shart, aks holda bir xil qiymat ikki xil
// holat (masalan "Normal" va "Past bosim") ko'rsatishi mumkin).
export function getWaterStatus(pressure: number | null): SensorStatusInfo {
  if (pressure == null) return unknownStatus()
  if (pressure >= 2.25 && pressure <= 3.2) return { level: 'alo', label: 'Normal', color: '#34D399', bgColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.4)' }
  if (pressure >= 1.5 && pressure < 2.25) return { level: 'norma', label: 'Past bosim', color: '#22D3EE', bgColor: 'rgba(34,211,238,0.15)', borderColor: 'rgba(34,211,238,0.4)' }
  if (pressure >= 0.8 && pressure < 1.5) return { level: 'orta', label: 'Juda past', color: '#FBBF24', bgColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.4)' }
  return { level: 'yomon', label: 'Xavfli!', color: '#FB7185', bgColor: 'rgba(251,113,133,0.2)', borderColor: 'rgba(251,113,133,0.5)' }
}

// ── Gaz bosimi (bar) ────────────────────────────────────────────────────────
export function getGasStatus(pressure: number | null): SensorStatusInfo {
  if (pressure == null) return unknownStatus()
  if (pressure >= 0.25 && pressure <= 0.35) return { level: 'alo', label: 'Yaxshi', color: '#34D399', bgColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.4)' }
  if (pressure >= 0.15 && pressure < 0.25) return { level: 'norma', label: "Me'yorda", color: '#22D3EE', bgColor: 'rgba(34,211,238,0.15)', borderColor: 'rgba(34,211,238,0.4)' }
  if (pressure >= 0.05 && pressure < 0.15) return { level: 'orta', label: 'Past bosim', color: '#FBBF24', bgColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.4)' }
  return { level: 'yomon', label: 'Xavfli!', color: '#FB7185', bgColor: 'rgba(251,113,133,0.2)', borderColor: 'rgba(251,113,133,0.5)' }
}

// ── Yerto'la namligi (%) ────────────────────────────────────────────────────
export function getSoilStatus(humidity: number | null): SensorStatusInfo {
  if (humidity == null) return unknownStatus()
  if (humidity < 40) return { level: 'alo', label: 'Quruq', color: '#34D399', bgColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.4)' }
  if (humidity < 65) return { level: 'norma', label: "Me'yorda", color: '#22D3EE', bgColor: 'rgba(34,211,238,0.15)', borderColor: 'rgba(34,211,238,0.4)' }
  if (humidity <= 80) return { level: 'orta', label: 'Nam', color: '#FBBF24', bgColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.4)' }
  return { level: 'yomon', label: 'Zahli!', color: '#FB7185', bgColor: 'rgba(251,113,133,0.2)', borderColor: 'rgba(251,113,133,0.5)' }
}

// ── Ovoz / Shovqin darajasi (%) ─────────────────────────────────────────────
export function getSoundStatus(level: number | null): SensorStatusInfo {
  if (level == null) return unknownStatus()
  if (level < 25) return { level: 'alo', label: 'Tinch', color: '#34D399', bgColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.4)' }
  if (level < 50) return { level: 'norma', label: "Me'yorda", color: '#22D3EE', bgColor: 'rgba(34,211,238,0.15)', borderColor: 'rgba(34,211,238,0.4)' }
  if (level <= 75) return { level: 'orta', label: 'Shovqinli', color: '#FBBF24', bgColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.4)' }
  return { level: 'yomon', label: "O'ta baland!", color: '#FB7185', bgColor: 'rgba(251,113,133,0.2)', borderColor: 'rgba(251,113,133,0.5)' }
}

// ── Qozonxona ΔT harorat farqi (°C) ────────────────────────────────────────
export function getHeatingStatus(deltaT: number | null): SensorStatusInfo {
  if (deltaT == null) return unknownStatus()
  if (deltaT >= 10 && deltaT <= 30) return { level: 'alo', label: 'Normal', color: '#34D399', bgColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.4)' }
  if (deltaT > 30) return { level: 'orta', label: 'Farq katta', color: '#FBBF24', bgColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.4)' }
  return { level: 'norma', label: 'Farq kichik', color: '#22D3EE', bgColor: 'rgba(34,211,238,0.15)', borderColor: 'rgba(34,211,238,0.4)' }
}

// ── Havo sifati (%) ────────────────────────────────────────────────────────
export function getAirQualityStatus(qualityPct: number | null): SensorStatusInfo {
  if (qualityPct == null) return unknownStatus()
  if (qualityPct >= 80) return { level: 'alo', label: "Toza (A'lo)", color: '#34D399', bgColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.4)' }
  if (qualityPct >= 60) return { level: 'norma', label: "Me'yorda", color: '#22D3EE', bgColor: 'rgba(34,211,238,0.15)', borderColor: 'rgba(34,211,238,0.4)' }
  if (qualityPct >= 40) return { level: 'orta', label: 'Qoniqarsiz', color: '#FBBF24', bgColor: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.4)' }
  return { level: 'yomon', label: 'Ifloslangan!', color: '#FB7185', bgColor: 'rgba(251,113,133,0.2)', borderColor: 'rgba(251,113,133,0.5)' }
}

// ── Universal holat olish ───────────────────────────────────────────────────
export function getSensorStatus(sensorKey: string, value: number | null): SensorStatusInfo {
  switch (sensorKey) {
    case 'electricity': return getElectricityStatus(value)
    case 'water': return getWaterStatus(value)
    case 'gas': return getGasStatus(value)
    case 'soil': return getSoilStatus(value)
    case 'sound': return getSoundStatus(value)
    case 'heating': return getHeatingStatus(value)
    case 'air_quality': return getAirQualityStatus(value)
    default: return unknownStatus()
  }
}

function unknownStatus(): SensorStatusInfo {
  return {
    level: 'unknown',
    label: '—',
    color: '#94a3b8',
    bgColor: 'rgba(148,163,184,0.1)',
    borderColor: 'rgba(148,163,184,0.3)',
  }
}

// ── Universal Status Badge Komponent ────────────────────────────────────────
interface SensorStatusBadgeProps {
  sensorKey: string
  value: number | null
  size?: 'sm' | 'md' | 'lg'
}

export function SensorStatusBadge({ sensorKey, value, size = 'md' }: SensorStatusBadgeProps) {
  const status = getSensorStatus(sensorKey, value)

  const sizeClasses =
    size === 'lg'
      ? 'px-4 py-1.5 text-base gap-2'
      : size === 'sm'
      ? 'px-2 py-0.5 text-[10px] gap-1'
      : 'px-2.5 py-0.5 text-xs gap-1.5'

  const dotSize =
    size === 'lg' ? 'h-3 w-3' : size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold transition-all ${sizeClasses}`}
      style={{
        color: status.color,
        backgroundColor: status.bgColor,
        borderColor: status.borderColor,
        boxShadow: size === 'lg' ? `0 0 20px ${status.bgColor}` : 'none',
      }}
    >
      <span
        className={`rounded-full ${status.level === 'yomon' ? 'animate-pulse' : ''} ${dotSize}`}
        style={{ backgroundColor: status.color }}
      />
      {status.label}
    </span>
  )
}
