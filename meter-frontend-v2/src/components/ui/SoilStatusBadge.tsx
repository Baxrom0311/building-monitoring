// Yerto'la namlik darajasini baholash:
// < 65%: Norma (Yaxshi - Yashil)
// 65% - 80%: O'rta (Diqqat - Sariq)
// > 80%: Yomon (Xavf - Qizil)

export type SoilStatusLevel = 'norma' | 'orta' | 'yomon'

export interface SoilStatusInfo {
  level: SoilStatusLevel
  label: string
  color: string
  bgColor: string
  borderColor: string
  badgeText: string
  description: string
}

export function getSoilHumidityStatus(humidity: number | null): SoilStatusInfo {
  if (humidity == null) {
    return {
      level: 'norma',
      label: "Ma'lumot yo'q",
      color: '#94a3b8',
      bgColor: 'rgba(148, 163, 184, 0.1)',
      borderColor: 'rgba(148, 163, 184, 0.3)',
      badgeText: '—',
      description: "O'lchov ma'lumoti kelmadi",
    }
  }

  if (humidity < 65) {
    return {
      level: 'norma',
      label: "Me'yorda (Quruq)",
      color: '#34D399', // Emerald green
      bgColor: 'rgba(52, 211, 153, 0.15)',
      borderColor: 'rgba(52, 211, 153, 0.4)',
      badgeText: 'NORMA',
      description: "Yerto'la quruq va me'yorda (<65%)",
    }
  } else if (humidity <= 80) {
    return {
      level: 'orta',
      label: "O'rtacha nam",
      color: '#FBBF24', // Amber yellow
      bgColor: 'rgba(251, 191, 36, 0.15)',
      borderColor: 'rgba(251, 191, 36, 0.4)',
      badgeText: "O'RTA",
      description: "Namlik oshgan (65%-80%), shamollatish zarur",
    }
  } else {
    return {
      level: 'yomon',
      label: 'Yuqori namlik (Xavf!)',
      color: '#FB7185', // Rose red
      bgColor: 'rgba(251, 113, 133, 0.2)',
      borderColor: 'rgba(251, 113, 133, 0.5)',
      badgeText: 'YOMON',
      description: "Yuqori namlik (>80%), sizot suvi xavfi!",
    }
  }
}

interface SoilStatusBadgeProps {
  value: number | null
  showScale?: boolean
}

export function SoilStatusBadge({ value, showScale = true }: SoilStatusBadgeProps) {
  const status = getSoilHumidityStatus(value)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold transition-all shadow-xs"
          style={{
            color: status.color,
            backgroundColor: status.bgColor,
            borderColor: status.borderColor,
          }}
        >
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: status.color }} />
          {status.label}
        </span>
      </div>

      {showScale && (
        <div className="space-y-1">
          {/* 3 ta daraja indikatori bar */}
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-900/60 p-1 border border-white/5">
            <div
              className={`flex items-center justify-center rounded py-0.5 text-[10px] font-bold transition-all ${
                status.level === 'norma'
                  ? 'bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/50'
                  : 'text-slate-500 opacity-60'
              }`}
            >
              NORMA (&lt;65%)
            </div>
            <div
              className={`flex items-center justify-center rounded py-0.5 text-[10px] font-bold transition-all ${
                status.level === 'orta'
                  ? 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50'
                  : 'text-slate-500 opacity-60'
              }`}
            >
              O'RTA (65-80%)
            </div>
            <div
              className={`flex items-center justify-center rounded py-0.5 text-[10px] font-bold transition-all ${
                status.level === 'yomon'
                  ? 'bg-red-500/30 text-red-300 ring-1 ring-red-500/50 animate-pulse'
                  : 'text-slate-500 opacity-60'
              }`}
            >
              YOMON (&gt;80%)
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
