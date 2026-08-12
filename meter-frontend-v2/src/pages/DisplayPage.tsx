import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Building2,
  Droplets,
  Flame,
  Maximize2,
  Minimize2,
  Droplet,
  RefreshCw,
  RotateCw,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Volume2,
  Wind,
  Zap,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/env'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { StatusPulse } from '@/components/ui/StatusPulse'
import { getSoilHumidityStatus } from '@/components/ui/SoilStatusBadge'
import { SensorStatusBadge } from '@/components/ui/SensorStatus'
import type { HourlyUtilityStat } from '@/types/api'

// PUBLIC kiosk sahifa — AppLayout tashqarisida, autentifikatsiyasiz.
// O'z qorong'i konteyner uslubini saqlaydi (katta ekran/TV rejimi).

const BASE = API_BASE_URL || window.location.origin

interface LatestValue {
  value: number | null
  value_out?: number | null
  air_quality?: number | null
  ts?: number
}

interface DisplayData {
  building?: { id: number; name: string; address?: string | null } | null
  buildings?: { id: number; name: string }[]
  // Real-vaqt qiymatlari (soatlik o'rtacha emas) — har utility uchun eng oxirgi xom o'qish
  latest?: Partial<Record<'electricity' | 'water' | 'gas' | 'soil' | 'sound' | 'heating', LatestValue>>
  electricity: HourlyUtilityStat[]
  water: HourlyUtilityStat[]
  gas: HourlyUtilityStat[]
  soil: HourlyUtilityStat[]
  sound: HourlyUtilityStat[]
  heating?: HourlyUtilityStat[]
}

// ?building_id=3 bo'lsa kiosk faqat shu bino ma'lumotini ko'rsatadi
const BUILDING_ID = new URLSearchParams(window.location.search).get('building_id')

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
}

/** Soatlik nuqtalarni multi-series bo'yicha birlashtirish (recharts uchun) */
function buildMultiPoints(rows: HourlyUtilityStat[], keys: (keyof HourlyUtilityStat)[]): Record<string, any>[] {
  const byTs: Record<number, Record<string, any>> = {}
  for (const r of rows) {
    const ts = r.bucket_ts
    if (!byTs[ts]) byTs[ts] = { label: fmt(ts) }
    keys.forEach((k, idx) => {
      const v = r[k]
      if (typeof v === 'number') byTs[ts][`v${idx}`] = v
    })
  }
  return Object.keys(byTs)
    .sort((a, b) => Number(a) - Number(b))
    .slice(-24)
    .map((ts) => byTs[Number(ts)])
}

/** Real ma'lumot bo'lmaganda namunaviy (fake) grafik generatori */
function fakePoints(base: number, amp: number): { label: string; value: number }[] {
  const now = Math.floor(Date.now() / 1000)
  const res: { label: string; value: number }[] = []
  for (let i = 23; i >= 0; i--) {
    const ts = now - i * 3600
    const label = fmt(ts)
    const sinVal = Math.sin((i / 24) * Math.PI * 4) * amp
    const noise = (Math.random() - 0.5) * amp * 0.4
    const value = Number((base + sinVal + noise).toFixed(2))
    res.push({ label, value })
  }
  return res
}

// Elektr va suv/gaz uchun nominal qiymatlar
const ELEC_NOMINAL = 220
const WATER_NOMINAL = 2.7
const GAS_NOMINAL = 0.27

function voltageColor(v: number | null): string {
  if (v == null) return '#94a3b8'
  if (v >= 210 && v <= 230) return '#22C55E'
  if ((v >= 195 && v < 210) || (v > 230 && v <= 240)) return '#FBBF24'
  return '#FB7185'
}

function getWaterColor(val: number | null): { color: string; status: string } {
  if (val == null) return { color: '#94a3b8', status: 'Nomalum' }
  if (val >= 2.3 && val <= 3.2) return { color: '#22C55E', status: 'Normal' }
  if (val >= 1.5 && val < 2.3) return { color: '#FBBF24', status: 'Past bosim' }
  if (val >= 0.8 && val < 1.5) return { color: '#F97316', status: 'Juda past' }
  return { color: '#FB7185', status: 'Xavfli' }
}

function getGasColor(val: number | null): { color: string; status: string } {
  if (val == null) return { color: '#94a3b8', status: 'Nomalum' }
  if (val >= 0.23 && val <= 0.33) return { color: '#22C55E', status: 'Yaxshi' }
  if (val >= 0.15 && val < 0.23) return { color: '#FBBF24', status: 'Past bosim' }
  return { color: '#FB7185', status: 'Xavfli' }
}

// Qozonxona normal ΔT (kirish-chiqish farqi)
const HEATING_DELTA_NORMA = 20

// ═══════════════════════════════════════════════════════════════════════════════
// OLED CYBERPUNK HUD (V3 OLED THEME STYLE)
// ═══════════════════════════════════════════════════════════════════════════════
const OLED_THEME = {
  pageBg: 'from-black via-black to-slate-950',
  headerBg: 'bg-black/90 backdrop-blur-2xl',
  headerBorder: 'border-cyan-500/50 shadow-[0_0_35px_rgba(6,182,212,0.25)]',
  cardBg: {
    electricity: 'from-black via-black to-slate-950',
    water: 'from-black via-black to-slate-950',
    gas: 'from-black via-black to-slate-950',
    soil: 'from-black via-black to-slate-950',
    sound: 'from-black via-black to-slate-950',
    heating: 'from-black via-black to-slate-950',
  },
  cardBorder: {
    electricity: 'border-yellow-400/70 shadow-[0_0_30px_rgba(250,204,21,0.25)] hover:border-yellow-300',
    water: 'border-emerald-400/70 shadow-[0_0_30px_rgba(52,211,153,0.25)] hover:border-emerald-300',
    gas: 'border-green-500/70 shadow-[0_0_30px_rgba(34,197,94,0.25)] hover:border-green-400',
    soil: 'border-teal-400/70 shadow-[0_0_30px_rgba(45,212,191,0.25)] hover:border-teal-300',
    sound: 'border-purple-400/70 shadow-[0_0_30px_rgba(192,132,252,0.25)] hover:border-purple-300',
    heating: 'border-cyan-400/70 shadow-[0_0_30px_rgba(34,211,238,0.25)] hover:border-cyan-300',
  },
  cardGlow: {
    electricity: 'rgba(250,204,21,0.35)',
    water: 'rgba(52,211,153,0.35)',
    gas: 'rgba(34,197,94,0.35)',
    soil: 'rgba(45,212,191,0.35)',
    sound: 'rgba(192,132,252,0.35)',
    heating: 'rgba(34,211,238,0.35)',
  },
  clockBg: 'border-cyan-500/40 bg-cyan-950/40 backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.3)]',
  clockText: 'text-cyan-300',
}

const CHARTS = [
  {
    key: 'electricity' as const,
    dataKey: 'avg_voltage_l1' as keyof HourlyUtilityStat,
    label: 'Elektr kuchlanishi',
    unit: 'V',
    icon: Zap,
    color: '#FDE047',
    glow: 'rgba(253,224,71,0.5)',
    bg: 'from-amber-500/20 via-slate-900/80 to-slate-950',
    nominal: 220 as number | null,
    fake: null as { base: number; amp: number } | null,
  },
  {
    key: 'water' as const,
    dataKey: 'avg_pressure_bottom_bar' as keyof HourlyUtilityStat,
    label: 'Suv bosimi',
    unit: 'bar',
    icon: Droplets,
    color: '#22C55E',
    glow: 'rgba(34,197,94,0.5)',
    bg: 'from-emerald-500/20 via-slate-900/80 to-slate-950',
    nominal: WATER_NOMINAL as number | null,
    fake: { base: WATER_NOMINAL, amp: 0.25 } as { base: number; amp: number } | null,
  },
  {
    key: 'gas' as const,
    dataKey: 'avg_pressure_bar' as keyof HourlyUtilityStat,
    label: 'Gaz bosimi',
    unit: 'bar',
    icon: Flame,
    color: '#22C55E',
    glow: 'rgba(34,197,94,0.5)',
    bg: 'from-orange-500/20 via-slate-900/80 to-slate-950',
    nominal: GAS_NOMINAL as number | null,
    fake: { base: GAS_NOMINAL, amp: 0.03 } as { base: number; amp: number } | null,
  },
  {
    key: 'soil' as const,
    dataKey: 'avg_humidity' as keyof HourlyUtilityStat,
    label: "Yerto'la namligi",
    unit: '%',
    icon: Droplet,
    color: '#34D399',
    glow: 'rgba(52,211,153,0.5)',
    bg: 'from-emerald-500/20 via-slate-900/80 to-slate-950',
    nominal: 60 as number | null,
    fake: null as { base: number; amp: number } | null,
  },
  {
    key: 'sound' as const,
    dataKey: 'avg_level' as keyof HourlyUtilityStat,
    label: 'Ovoz darajasi',
    unit: '%',
    icon: Volume2,
    color: '#C084FC',
    glow: 'rgba(192,132,252,0.5)',
    bg: 'from-violet-500/20 via-slate-900/80 to-slate-950',
    nominal: 40 as number | null,
    fake: null as { base: number; amp: number } | null,
  },
  {
    key: 'heating' as const,
    dataKey: 'avg_temperature_in_c' as keyof HourlyUtilityStat,
    label: 'Qozonxona harorati',
    unit: '°C',
    icon: Thermometer,
    color: '#06B6D4',
    glow: 'rgba(6,182,212,0.5)',
    bg: 'from-cyan-500/20 via-slate-900/80 to-slate-950',
    nominal: null as number | null,
    fake: null as { base: number; amp: number } | null,
  },
]

function LiveClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className={`flex flex-col items-end rounded-xl border px-2.5 py-1 sm:rounded-2xl sm:px-3.5 sm:py-1.5 ${OLED_THEME.clockBg}`}>
      <div className={`font-mono text-base font-black tabular-nums tracking-wider sm:text-xl md:text-2xl lg:text-3xl ${OLED_THEME.clockText}`}>
        {time.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="text-[10px] font-medium text-slate-400 sm:text-xs">
        {time.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })}
      </div>
    </div>
  )
}

function LiveDot({ ok }: { ok: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold">
      <StatusPulse status={ok} size="sm" />
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? 'JONLI' : 'UZILDI'}</span>
    </span>
  )
}

export default function DisplayPage() {
  const [data, setData] = useState<DisplayData | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [online, setOnline] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  const fetchData = useCallback(async () => {
    setSpinning(true)
    try {
      const url = BUILDING_ID
        ? `${BASE}/api/public/display?building_id=${encodeURIComponent(BUILDING_ID)}`
        : `${BASE}/api/public/display`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const json: DisplayData = await res.json()
      setData(json)
      setLastUpdate(new Date())
      setOnline(true)
    } catch {
      setOnline(false)
    } finally {
      setTimeout(() => setSpinning(false), 600)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [fetchData])

  // Binolarni har 15 soniyada avtomatik almashtirib turish (Auto-rotate mode)
  useEffect(() => {
    if (!autoRotate || !data?.buildings || data.buildings.length < 2) return
    const interval = setInterval(() => {
      const buildings = data.buildings ?? []
      const currentId = BUILDING_ID ? Number(BUILDING_ID) : null
      const currentIndex = buildings.findIndex((b) => b.id === currentId)
      const nextIndex = (currentIndex + 1) % buildings.length
      const nextId = buildings[nextIndex].id
      const url = new URL(window.location.href)
      url.searchParams.set('building_id', String(nextId))
      window.location.href = url.toString()
    }, 15_000)
    return () => clearInterval(interval)
  }, [autoRotate, data])

  const charts = CHARTS.map((cfg) => {
    // Qozonxona uchun ikki seriya (kirish cyan, chiqish sky blue), qolganlar bitta seriya
    const seriesDefs =
      cfg.key === 'heating'
        ? [
            { key: 'avg_temperature_in_c' as keyof HourlyUtilityStat, label: 'Kirish', color: '#06B6D4' },
            { key: 'avg_temperature_out_c' as keyof HourlyUtilityStat, label: 'Chiqish', color: '#38BDF8' },
          ]
        : [{ key: cfg.dataKey, label: cfg.label, color: cfg.color }]

    let points = data ? buildMultiPoints(data[cfg.key] ?? [], seriesDefs.map((s) => s.key)) : []
    const hasReal = points.some((p) => seriesDefs.some((_, i) => p[`v${i}`] != null))
    let isFake = false
    if (!hasReal && cfg.fake && data) {
      points = fakePoints(cfg.fake.base, cfg.fake.amp).map((p) => ({ label: p.label, v0: p.value }))
      isFake = true
    }

    const series = seriesDefs.map((sd, i) => {
      const vals = points.map((p) => p[`v${i}`]).filter((v): v is number => v != null)
      const hourlyLatest = vals.length ? vals[vals.length - 1] : null
      const prev = vals.length > 1 ? vals[vals.length - 2] : null
      return {
        ...sd,
        index: i,
        latest: hourlyLatest,
        trend: hourlyLatest != null && prev != null ? hourlyLatest - prev : null,
        hourlyLatest,
      }
    })

    // Real-vaqt qiymati bilan almashtirish — kattasi joriy o'qishni ko'rsatadi
    const rawLatest = data?.latest?.[cfg.key]
    if (rawLatest?.value != null) {
      series[0].latest = rawLatest.value
    }
    if (cfg.key === 'heating' && rawLatest?.value_out != null && series[1]) {
      series[1].latest = rawLatest.value_out
    }

    return {
      ...cfg,
      points,
      series,
      isFake,
    }
  })

  return (
    <div
      className={`relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br text-slate-100 font-sans selection:bg-cyan-500 selection:text-white ${OLED_THEME.pageBg}`}
    >
      {/* Orqa fondagi texnik to'r (grid background) va nur g'ubori */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(6,182,212,0.15),rgba(255,255,255,0))]" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Sarlavha — Mobile/Tablet va Desktop uchun moslashuvchan header */}
      <header className={`relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4 ${OLED_THEME.headerBg} ${OLED_THEME.headerBorder}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/40 ring-1 ring-white/10 sm:h-12 sm:w-12 sm:rounded-2xl">
            <Building2 className="h-5 w-5 text-white sm:h-6 sm:w-6" />
          </div>
          <div>
            <div className="text-base font-extrabold tracking-tight text-white sm:text-xl lg:text-2xl">
              {data?.building?.name ?? 'SmartBino'}
            </div>
            <div className="text-[11px] text-slate-400 sm:text-xs">
              {data?.building
                ? (data.building.address ?? 'Bino monitoringi')
                : 'Kommunal monitoring tizimi — barcha binolar'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4">
          {data?.buildings && data.buildings.length > 0 && (
            <select
              value={BUILDING_ID ?? ''}
              onChange={(e) => {
                const v = e.target.value
                const url = new URL(window.location.href)
                if (v) url.searchParams.set('building_id', v)
                else url.searchParams.delete('building_id')
                window.location.href = url.toString()
              }}
              className="max-w-[130px] rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 outline-none backdrop-blur transition-colors hover:border-white/20 focus:border-cyan-500 sm:max-w-[200px] sm:px-3 sm:py-2 sm:text-sm"
            >
              <option value="" className="bg-slate-900">
                Barcha binolar
              </option>
              {data.buildings.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-900">
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Status badge + harakat tugmalari */}
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-slate-400 backdrop-blur sm:gap-3 sm:px-3 sm:py-2">
            <LiveDot ok={online} />
            {lastUpdate && (
              <span className="hidden text-xs md:inline-block">
                {lastUpdate.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            {data?.buildings && data.buildings.length > 1 && (
              <button
                onClick={() => setAutoRotate(!autoRotate)}
                title={autoRotate ? "Avto-almashinuvni to'xtatish" : "Binolarni avto-almashtirish (15s)"}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                  autoRotate
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <RotateCw className={`h-3.5 w-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{autoRotate ? 'Auto' : 'Auto'}</span>
              </button>
            )}
            <button
              onClick={fetchData}
              title="Ma'lumotlarni yangilash"
              className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran rejimiga o'tish (Kiosk)"}
              className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4 text-amber-400" /> : <Maximize2 className="h-4 w-4 text-blue-400" />}
            </button>
          </div>

          {/* Jonli Soat & Sana — doimo va har qanday ekranda ko'rinib turadigan chiroyli vidjet */}
          <LiveClock />
        </div>
      </header>

      {/* Grafiklar — Desktopda 3×2 grid, planshetda 2-kolonka scroll bilan, mobilda 1-kolonka */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4 lg:grid-cols-3">
        {charts.map((cfg) => {
          const Icon = cfg.icon
          const single = cfg.series.length === 1
          const s0 = cfg.series[0]
          const TrendIcon =
            single && s0.trend != null && s0.trend !== 0 ? (s0.trend > 0 ? TrendingUp : TrendingDown) : null

          // Elektr: 220V o'rtada nol chizig'i — past qiymat pastga, yuqori qiymat tepaga o'sadi
          const isElec = cfg.key === 'electricity'
          const elecVals = isElec
            ? cfg.points.map((p) => p.v0).filter((n): n is number => typeof n === 'number')
            : []
          const elecSpan = elecVals.length ? Math.max(15, ...elecVals.map((v) => Math.abs(v - ELEC_NOMINAL))) : 20
          const elecDomain: [number, number] = [-(elecSpan + 5), elecSpan + 5]
          const elecData = isElec
            ? cfg.points.map((p) => ({
                ...p,
                v0: p.v0,
                dev: p.v0 != null ? Number((p.v0 - ELEC_NOMINAL).toFixed(2)) : null,
              }))
            : cfg.points

          // Suv: 2.7 bar aynan grafik o'rtasida bo'lishi uchun simmetrik Y-domen
          const isWater = cfg.key === 'water'
          const waterVals = isWater
            ? cfg.points.map((p) => p.v0).filter((n): n is number => typeof n === 'number')
            : []
          const waterMaxDiff = waterVals.length
            ? Math.max(0.6, ...waterVals.map((v) => Math.abs(v - WATER_NOMINAL)))
            : 0.8
          const waterDomain: [number, number] = [
            Math.max(0, Number((WATER_NOMINAL - waterMaxDiff - 0.3).toFixed(1))),
            Number((WATER_NOMINAL + waterMaxDiff + 0.3).toFixed(1)),
          ]

          // Gaz: 0.27 bar aynan grafik o'rtasida bo'lishi uchun simmetrik Y-domen
          const isGas = cfg.key === 'gas'
          const gasVals = isGas
            ? cfg.points.map((p) => p.v0).filter((n): n is number => typeof n === 'number')
            : []
          const gasMaxDiff = gasVals.length
            ? Math.max(0.08, ...gasVals.map((v) => Math.abs(v - GAS_NOMINAL)))
            : 0.1
          const gasDomain: [number, number] = [
            Math.max(0, Number((GAS_NOMINAL - gasMaxDiff - 0.04).toFixed(2))),
            Number((GAS_NOMINAL + gasMaxDiff + 0.04).toFixed(2)),
          ]

          const soilStatus = cfg.key === 'soil' ? getSoilHumidityStatus(s0.latest) : null
          const valueColor =
            isElec && s0.latest != null
              ? voltageColor(s0.latest)
              : isWater && s0.latest != null
              ? getWaterColor(s0.latest).color
              : isGas && s0.latest != null
              ? getGasColor(s0.latest).color
              : cfg.key === 'soil' && soilStatus
              ? soilStatus.color
              : cfg.color

          const cardBgStyle = OLED_THEME.cardBg[cfg.key] || OLED_THEME.cardBg.electricity
          const cardBorderStyle = OLED_THEME.cardBorder[cfg.key] || OLED_THEME.cardBorder.electricity
          const cardGlowStyle = OLED_THEME.cardGlow[cfg.key] || OLED_THEME.cardGlow.electricity

          return (
            <div
              key={cfg.key}
              className={`group relative flex min-h-[340px] flex-col overflow-hidden rounded-3xl border bg-gradient-to-b backdrop-blur-2xl transition-all duration-300 hover:scale-[1.015] hover:shadow-[0_20px_50px_rgba(0,0,0,0.8)] lg:min-h-0 ${cardBgStyle} ${cardBorderStyle}`}
            >
              {/* Tepa aksent chizig'i */}
              <div
                className="absolute inset-x-0 top-0 h-1.5"
                style={{
                  background: `linear-gradient(90deg, transparent 5%, ${cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color} 50%, transparent 95%)`,
                  boxShadow: `0 2px 10px ${cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color}`,
                }}
              />
              {/* Glow */}
              <div
                className="pointer-events-none absolute inset-0 opacity-40 transition-opacity duration-300 group-hover:opacity-65"
                style={{ background: `radial-gradient(circle 280px at 50% 10%, ${cardGlowStyle}, transparent 80%)` }}
              />

              {/* Card sarlavhasi */}
              <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-4 pb-1 pt-4 sm:px-6 sm:pt-5">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border shadow-xl transition-all group-hover:scale-105 sm:h-14 sm:w-14"
                    style={{
                      background: cfg.key === 'soil' && soilStatus ? soilStatus.bgColor : `${cfg.color}18`,
                      borderColor: `${cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color}40`,
                      boxShadow: `0 8px 24px ${cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color}25`,
                    }}
                  >
                    <Icon
                      className="h-6 w-6 sm:h-7 sm:w-7"
                      style={{ color: cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color }}
                    />
                  </div>
                  <div>
                    <h2 className="text-base font-bold tracking-wide text-slate-100 sm:text-xl">
                      {cfg.label}
                    </h2>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 sm:text-sm">
                      <SensorStatusBadge sensorKey={cfg.key} value={s0.latest} />
                      {cfg.nominal != null && (
                        <span className="text-[11px] text-slate-400">
                          (norma {cfg.nominal} {cfg.unit})
                        </span>
                      )}
                      {cfg.key === 'heating' && (
                        <span className="text-[11px] text-cyan-300/90">
                          (norma ΔT {HEATING_DELTA_NORMA}°C)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {cfg.isFake && (
                  <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                    Namunaviy
                  </span>
                )}
              </div>

              {/* Real-Vaqt Ko'rsatkichi (Katta Neon 3D Raqam) */}
              <div className="relative z-10 flex shrink-0 items-baseline justify-between px-4 py-2 sm:px-6 sm:py-3">
                {single ? (
                  <div className="flex items-baseline gap-2">
                    <div className="flex items-baseline gap-2">
                      <div
                        className="font-mono text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl"
                        style={{
                          color: valueColor,
                          textShadow: `0 0 35px ${valueColor}60, 0 4px 12px rgba(0,0,0,0.9)`,
                        }}
                      >
                        {s0.latest != null ? (
                          <AnimatedNumber value={s0.latest} decimals={isElec || cfg.key === 'soil' || cfg.key === 'sound' ? 1 : 2} />
                        ) : (
                          '—'
                        )}
                      </div>
                      <span className="text-lg font-bold text-slate-300 sm:text-2xl">{cfg.unit}</span>

                      {cfg.key === 'soil' && (
                        <div className="ml-auto flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 backdrop-blur shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                          <Wind className="h-4 w-4 text-emerald-400 animate-pulse" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/80">Havo sifati</span>
                            <span className="text-xs font-black text-emerald-200">
                              {data?.latest?.soil?.air_quality != null
                                ? `${Math.max(0, 100 - data.latest.soil.air_quality).toFixed(0)}% (${data.latest.soil.air_quality <= 30 ? "A'lo" : data.latest.soil.air_quality <= 60 ? "Me'yorda" : "Ifloslangan"})`
                                : "Toza (A'lo)"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Qozonxona (Kirish & Chiqish & ΔT farqi) */
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-bold uppercase text-slate-400">Kirish:</span>
                      <span className="font-mono text-2xl font-black text-cyan-400 sm:text-3xl lg:text-4xl">
                        {cfg.series[0].latest != null ? (
                          <AnimatedNumber value={cfg.series[0].latest} decimals={1} />
                        ) : (
                          '—'
                        )}
                      </span>
                      <span className="text-xs font-bold text-slate-400 sm:text-sm">°C</span>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-bold uppercase text-slate-400">Chiqish:</span>
                      <span className="font-mono text-2xl font-black text-sky-300 sm:text-3xl lg:text-4xl">
                        {cfg.series[1]?.latest != null ? (
                          <AnimatedNumber value={cfg.series[1].latest} decimals={1} />
                        ) : (
                          '—'
                        )}
                      </span>
                      <span className="text-xs font-bold text-slate-400 sm:text-sm">°C</span>
                    </div>

                    {/* Kirish va Chiqish farqi ΔT badge */}
                    {cfg.series[0].latest != null && cfg.series[1]?.latest != null && (
                      <div className="hidden flex-col items-end rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-right backdrop-blur sm:flex">
                        <span className="text-[10px] font-bold uppercase text-cyan-300">ΔT Farq</span>
                        <span className="font-mono text-sm font-black text-cyan-200">
                          {Math.abs(cfg.series[0].latest - cfg.series[1].latest).toFixed(1)}°C
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Trend ko'rsatkichi */}
                {single && TrendIcon && s0.trend != null && (
                  <div
                    className={`flex items-center gap-1 text-xs font-bold sm:text-sm ${
                      s0.trend > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    <TrendIcon className="h-4 w-4" />
                    <span>
                      {s0.trend > 0 ? '+' : ''}
                      {s0.trend.toFixed(isElec || cfg.key === 'soil' || cfg.key === 'sound' ? 1 : 2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Soatlik 24 Soatlik Grafik */}
              <div className="relative z-10 flex min-h-[160px] flex-1 flex-col justify-end px-2 pb-3 sm:px-4 sm:pb-4">
                <div className="mb-1.5 flex items-center justify-between px-2 text-[11px] font-bold tracking-wider text-slate-400">
                  <span>Oxirgi 24 soatlik dinamika</span>
                  <span>{cfg.points.length} ta o'lchov</span>
                </div>

                <div className="h-32 w-full sm:h-36 lg:h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={isElec ? elecData : cfg.points}
                      margin={{ top: 12, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={24}
                      />
                      <YAxis
                        domain={
                          isElec
                            ? elecDomain
                            : isWater
                            ? waterDomain
                            : isGas
                            ? gasDomain
                            : cfg.key === 'soil' || cfg.key === 'sound'
                            ? [0, 100]
                            : ['auto', 'auto']
                        }
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => (isElec ? `${ELEC_NOMINAL + v}` : String(v))}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: 'rgba(255,255,255,0.15)',
                          borderRadius: '12px',
                          color: '#f8fafc',
                          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
                        }}
                        formatter={(val: any, name: any) => {
                          if (val == null) return ['—', name]
                          const num = Number(val)
                          if (isElec) return [`${(ELEC_NOMINAL + num).toFixed(1)} V`, 'Kuchlanish']
                          if (cfg.key === 'heating') {
                            const lbl = name === 'v0' ? 'Kirish' : 'Chiqish'
                            return [`${num.toFixed(1)} °C`, lbl]
                          }
                          return [`${num.toFixed(isWater || isGas ? 2 : 1)} ${cfg.unit}`, cfg.label]
                        }}
                      />

                      {/* Elektr: 220V Markaziy Norma Chizig'i (Pastga va Tepaga o'sadi) */}
                      {isElec && <ReferenceLine y={0} stroke="#22C55E" strokeDasharray="4 4" strokeWidth={1.5} />}

                      {/* Suv: 2.7 bar Norma Chizig'i */}
                      {isWater && <ReferenceLine y={WATER_NOMINAL} stroke="#22C55E" strokeDasharray="4 4" strokeWidth={1.5} />}

                      {/* Gaz: 0.27 bar Norma Chizig'i */}
                      {isGas && <ReferenceLine y={GAS_NOMINAL} stroke="#22C55E" strokeDasharray="4 4" strokeWidth={1.5} />}

                      {/* Bar rendering */}
                      {cfg.key === 'heating' ? (
                        <>
                          <Bar dataKey="v0" name="v0" fill="#06B6D4" radius={[4, 4, 0, 0]} maxBarSize={10} />
                          <Bar dataKey="v1" name="v1" fill="#38BDF8" radius={[4, 4, 0, 0]} maxBarSize={10} />
                        </>
                      ) : (
                        <Bar
                          dataKey={isElec ? 'dev' : 'v0'}
                          radius={isElec ? [4, 4, 4, 4] : [4, 4, 0, 0]}
                          maxBarSize={isElec ? 14 : 18}
                        >
                          {(isElec ? elecData : cfg.points).map((entry: any, index: number) => {
                            let cellColor = cfg.color
                            if (isElec) {
                              const absVal = entry.v0 != null ? entry.v0 : ELEC_NOMINAL
                              cellColor = voltageColor(absVal)
                            } else if (isWater) {
                              cellColor = getWaterColor(entry.v0).color
                            } else if (isGas) {
                              cellColor = getGasColor(entry.v0).color
                            } else if (cfg.key === 'soil') {
                              const st = getSoilHumidityStatus(entry.v0)
                              cellColor = st ? st.color : cfg.color
                            }
                            return <Cell key={`cell-${index}`} fill={cellColor} opacity={0.9} />
                          })}
                        </Bar>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
