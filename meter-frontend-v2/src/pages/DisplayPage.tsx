import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChart3,
  Building2,
  CircleDot,
  Droplets,
  Flame,
  Gauge,
  GripHorizontal,
  Maximize2,
  Minimize2,
  Droplet,
  RefreshCw,
  RotateCw,
  Spline,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Volume2,
  Waves,
  Wind,
  Zap,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/env'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { StatusPulse } from '@/components/ui/StatusPulse'
import { getSoilHumidityStatus } from '@/components/ui/SoilStatusBadge'
import { SensorStatusBadge, getSensorStatus, getHeatingStatus } from '@/components/ui/SensorStatus'
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
  latest?: Partial<Record<'electricity' | 'water' | 'gas' | 'soil' | 'sound' | 'heating' | 'air_quality', LatestValue>>
  electricity: HourlyUtilityStat[]
  water: HourlyUtilityStat[]
  gas: HourlyUtilityStat[]
  soil: HourlyUtilityStat[]
  sound: HourlyUtilityStat[]
  heating?: HourlyUtilityStat[]
  air_quality?: HourlyUtilityStat[]
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
    .slice(-96) // 15-daqiqalik bucket → 24 soat uchun to'liq zich sparkline
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
const WATER_NOMINAL = 2.25
const GAS_NOMINAL = 0.27

function voltageColor(v: number | null): string {
  if (v == null) return '#94a3b8'
  if (v >= 210 && v <= 230) return '#22C55E'
  if ((v >= 195 && v < 210) || (v > 230 && v <= 240)) return '#FBBF24'
  return '#FB7185'
}

// Chegaralar SensorStatus.tsx dagi getWaterStatus() bilan BIR XIL bo'lishi
// shart (ikkalasi ham WATER_NOMINAL=2.25 dan boshlanadi) — aks holda bitta
// qiymat kartada ikki xil holat (rang va matn) sifatida ko'rsatiladi.
function getWaterColor(val: number | null): { color: string; status: string } {
  if (val == null) return { color: '#94a3b8', status: 'Nomalum' }
  if (val >= WATER_NOMINAL && val <= 3.2) return { color: '#22C55E', status: 'Normal' }
  if (val >= 1.5 && val < WATER_NOMINAL) return { color: '#FBBF24', status: 'Past bosim' }
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
    key: 'air_quality' as const,
    dataKey: 'avg_air_quality' as keyof HourlyUtilityStat,
    label: 'Havo sifati',
    unit: '%',
    icon: Wind,
    color: '#10B981',
    glow: 'rgba(16,185,129,0.5)',
    bg: 'from-emerald-500/20 via-slate-900/80 to-slate-950',
    nominal: 75 as number | null,
    // Havo sifati MQ135 sensoridan REAL keladi (soil o'qishlari ichida, air_quality
    // ustuni). Backend uni barqaror uzatadi (latest_soil_resolved) — fake kerak emas;
    // ma'lumot bo'lmasa halol "—" ko'rsatiladi (soxta qiymat emas).
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
    label: 'Issiqlik',
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
    <div className="flex flex-col items-end rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1 sm:rounded-2xl sm:px-3.5 sm:py-1.5">
      <div className="font-mono text-base font-semibold tabular-nums tracking-wider text-slate-100 sm:text-xl md:text-2xl lg:text-3xl">
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
  // Auto-rotate holati sahifa qayta yuklanganда saqlanadi (localStorage) — aks
  // holda har almashишдан keyin reload state'ni false qilib rotatsiya to'xtardi (audit).
  const [autoRotate, setAutoRotate] = useState(() => {
    try {
      return localStorage.getItem('display_auto_rotate') === '1'
    } catch {
      return false
    }
  })
  const toggleAutoRotate = () =>
    setAutoRotate((v) => {
      const next = !v
      try {
        localStorage.setItem('display_auto_rotate', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  // Grafik turi — foydalanuvchi tanlashi uchun, saqlanadi. Standart + no-standart turlar
  const CHART_ORDER = ['bar', 'area', 'line', 'lollipop', 'gauge', 'dots'] as const
  type ChartStyle = (typeof CHART_ORDER)[number]
  const [chartStyle, setChartStyle] = useState<ChartStyle>(() => {
    try {
      const s = localStorage.getItem('display_chart_style') as ChartStyle | null
      return s && CHART_ORDER.includes(s) ? s : 'bar'
    } catch {
      return 'bar'
    }
  })
  const cycleChartStyle = () =>
    setChartStyle((c) => {
      const next = CHART_ORDER[(CHART_ORDER.indexOf(c) + 1) % CHART_ORDER.length]
      try {
        localStorage.setItem('display_chart_style', next)
      } catch {
        /* ignore */
      }
      return next
    })
  const CHART_META: Record<ChartStyle, { label: string; icon: typeof BarChart3 }> = {
    bar: { label: 'Ustun', icon: BarChart3 },
    area: { label: 'Maydon', icon: Waves },
    line: { label: 'Chiziq', icon: Spline },
    lollipop: { label: 'Nuqtali', icon: CircleDot },
    gauge: { label: 'Radial', icon: Gauge },
    dots: { label: 'Lenta', icon: GripHorizontal },
  }
  const chartStyleLabel = CHART_META[chartStyle].label
  const ChartStyleIcon = CHART_META[chartStyle].icon

  // Binolar ro'yxatini ref'да saqlaymiz — timer har 30s poll'da qayta qurilmasin.
  const buildingsRef = useRef<{ id: number; name: string }[]>([])

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

  // Binolar ro'yxatini ref'га sinxronlaymiz (timer'ni qayta qurmaslik uchun)
  useEffect(() => {
    buildingsRef.current = data?.buildings ?? []
  }, [data])

  // Binolarni har 15 soniyada avtomatik almashtirib turish (Auto-rotate mode).
  // deps faqat [autoRotate] — binolar ref'дан o'qiladi, shuning uchun 30s poll
  // timer'ni qayta qurmaydi (audit: nondeterministik kadans tuzatildi).
  useEffect(() => {
    if (!autoRotate) return
    const interval = setInterval(() => {
      const buildings = buildingsRef.current
      if (buildings.length < 2) return
      const currentId = BUILDING_ID ? Number(BUILDING_ID) : null
      const currentIndex = buildings.findIndex((b) => b.id === currentId)
      const nextIndex = (currentIndex + 1) % buildings.length
      const nextId = buildings[nextIndex].id
      const url = new URL(window.location.href)
      url.searchParams.set('building_id', String(nextId))
      window.location.href = url.toString()
    }, 15_000)
    return () => clearInterval(interval)
  }, [autoRotate])

  const charts = CHARTS.map((cfg) => {
    // Qozonxona uchun ikki seriya (kirish cyan, chiqish sky blue), qolganlar bitta seriya
    const seriesDefs =
      cfg.key === 'heating'
        ? [
            { key: 'avg_temperature_in_c' as keyof HourlyUtilityStat, label: 'Kirish', color: '#06B6D4' },
            { key: 'avg_temperature_out_c' as keyof HourlyUtilityStat, label: 'Chiqish', color: '#38BDF8' },
          ]
        : [{ key: cfg.dataKey, label: cfg.label, color: cfg.color }]

    let rawRows = data ? (data[cfg.key as keyof DisplayData] as HourlyUtilityStat[] | undefined) ?? [] : []
    if (cfg.key === 'air_quality' && data && rawRows.length === 0) {
      // Havo sifati soil (MQ135) yoki sound (ovoz+MQ135 kombinatsiya) qurilmasidan
      // kelishi mumkin — qaysi birida haqiqiy air_quality qatorlari bo'lsa, o'sha ishlatiladi.
      const soilHasAir = (data.soil ?? []).some((r) => r.avg_air_quality != null)
      const airSource = soilHasAir ? data.soil ?? [] : data.sound ?? []
      rawRows = airSource.map((r) => ({
        ...r,
        avg_air_quality: r.avg_air_quality != null ? Math.max(0, Number((100 - r.avg_air_quality).toFixed(1))) : null,
      }))
    }

    let points = buildMultiPoints(rawRows, seriesDefs.map((s) => s.key))
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
    const rawLatest =
      data?.latest?.[cfg.key] ??
      (cfg.key === 'air_quality'
        ? data?.latest?.soil?.air_quality != null
          ? data?.latest?.soil
          : data?.latest?.sound
        : undefined)
    if (cfg.key === 'air_quality') {
      if (rawLatest?.air_quality != null) {
        series[0].latest = Math.max(0, Number((100 - rawLatest.air_quality).toFixed(1)))
      }
    } else if (rawLatest?.value != null) {
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0a0e16] text-slate-100 font-sans selection:bg-cyan-500/40 selection:text-white">
      {/* Sarlavha — Mobile/Tablet va Desktop uchun moslashuvchan header */}
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0d1220] px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 ring-1 ring-white/10 sm:h-12 sm:w-12 sm:rounded-2xl">
            <Building2 className="h-5 w-5 text-slate-200 sm:h-6 sm:w-6" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight text-white sm:text-xl lg:text-2xl">
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
                onClick={toggleAutoRotate}
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
              onClick={cycleChartStyle}
              title={`Grafik turi: ${chartStyleLabel} (almashtirish uchun bosing)`}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChartStyleIcon className="h-4 w-4 text-cyan-400" />
              <span className="hidden sm:inline">{chartStyleLabel}</span>
            </button>
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
        {charts.map((cfg, i) => {
          const Icon = cfg.icon
          const single = cfg.series.length === 1
          const s0 = cfg.series[0]
          const TrendIcon =
            single && s0.trend != null && s0.trend !== 0 ? (s0.trend > 0 ? TrendingUp : TrendingDown) : null
          const decimals =
            cfg.key === 'electricity' || cfg.key === 'soil' || cfg.key === 'sound' ? 1 : 2

          // ── Yagona holat manbasi (rail + status so'zi + chegara/breathe) ──
          const dT =
            cfg.key === 'heating' && s0.latest != null && cfg.series[1]?.latest != null
              ? Math.abs(s0.latest - cfg.series[1].latest)
              : null
          const status = cfg.key === 'heating' ? getHeatingStatus(dT) : getSensorStatus(cfg.key, s0.latest)
          const isAlert = status.level === 'orta' || status.level === 'yomon'
          const isDanger = status.level === 'yomon'
          const st = status.level === 'yomon' ? '251,113,133' : status.level === 'orta' ? '251,191,36' : ''

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

          // ── Karta chegara/opasitesi va breathe (faqat anomaliya) ──
          const cardClasses = [
            'group relative flex min-h-[340px] flex-col overflow-hidden rounded-2xl bg-[#111725] border transition-[opacity,border-color,box-shadow] duration-700 lg:min-h-0 pl-4 animate-card-enter',
            isAlert ? 'opacity-100 status-breathe' : 'border-white/[0.06] opacity-[0.9]',
          ].join(' ')
          const cardStyle: Record<string, any> = { animationDelay: `${i * 70}ms` }
          if (isAlert) {
            cardStyle.borderColor = status.color
            cardStyle['--st'] = st
            cardStyle.animationDuration = isDanger ? '2s' : '3.2s'
          }

          // Qozonxona uchun ulkan raqam = ΔT, rangi status bilan; qolganlar valueColor
          const heroColor = cfg.key === 'heating' ? status.color : valueColor

          // ── Chart uchun umumiy: data, Y-domen, dataKey ──
          const chartData = isElec ? elecData : cfg.points
          const mainKey = isElec ? 'dev' : 'v0'
          const yDomain: any = isElec
            ? elecDomain
            : isWater
            ? waterDomain
            : isGas
            ? gasDomain
            : cfg.key === 'soil' || cfg.key === 'sound' || cfg.key === 'air_quality'
            ? [0, 100]
            : ['auto', 'auto']

          // ── Norma (me'yor) chizig'i — QALIN, YORQIN, ko'zga tashlanadigan ──
          const NORMA = '#34D399'
          const normaLines: any[] = []
          const pushNorma = (y: number, txt: string) =>
            normaLines.push(
              <ReferenceLine
                key="norma"
                y={y}
                stroke={NORMA}
                strokeWidth={2.5}
                strokeDasharray="7 5"
                ifOverflow="extendDomain"
                label={{ value: txt, position: 'insideTopRight', fill: NORMA, fontSize: 11, fontWeight: 800 }}
              />,
            )
          if (isElec) pushNorma(0, `norma ${ELEC_NOMINAL} ${cfg.unit}`)
          else if (cfg.nominal != null)
            pushNorma(cfg.nominal, cfg.unit === '%' ? `norma ${cfg.nominal}%` : `norma ${cfg.nominal} ${cfg.unit}`)

          // Har bir nuqtaning status rangi (ustun/lollipop/lenta uchun umumiy)
          const cellColorFor = (entry: any): string => {
            const v = entry?.v0
            if (v == null) return 'rgba(148,163,184,0.22)'
            if (isElec) return voltageColor(v)
            if (isWater) return getWaterColor(v).color
            if (isGas) return getGasColor(v).color
            if (cfg.key === 'soil') {
              const ss = getSoilHumidityStatus(v)
              return ss ? ss.color : cfg.color
            }
            return getSensorStatus(cfg.key, v).color
          }

          // Lollipop (nuqtali tayoqcha) — Bar uchun maxsus shakl: poya + kalla nuqta
          const LolliShape = (props: any) => {
            const { x, y, width, height, fill, payload } = props
            const cx = x + width / 2
            const v = payload?.[mainKey]
            const flip = isElec && v != null && v < 0
            const valueEnd = flip ? y + height : y
            const baseEnd = flip ? y : y + height
            return (
              <g>
                <line x1={cx} y1={baseEnd} x2={cx} y2={valueEnd} stroke={fill} strokeWidth={2} strokeOpacity={0.4} />
                <circle cx={cx} cy={valueEnd} r={3.5} fill={fill} />
              </g>
            )
          }

          // Radial gauge (spidometr) uchun joriy qiymatning foizli o'rni
          let gMin = 0
          let gMax = 100
          let gVal = s0.latest ?? 0
          if (isElec) {
            gMin = 180
            gMax = 260
            gVal = s0.latest ?? 220
          } else if (isWater) {
            gMin = 0
            gMax = 5
          } else if (isGas) {
            gMin = 0
            gMax = 0.5
          } else if (cfg.key === 'heating') {
            gMin = 0
            gMax = 40
            gVal = dT ?? 0
          }
          const gaugePct = Math.max(0, Math.min(100, ((gVal - gMin) / (gMax - gMin)) * 100))

          return (
            <div key={cfg.key} className={cardClasses} style={cardStyle}>
              {/* Anomaliya (orta/yomon) uchun yumshoq rangli to'ldiruvchi qatlam */}
              {isAlert && (
                <div
                  className="pointer-events-none absolute inset-0 z-0"
                  style={{ backgroundColor: status.bgColor }}
                />
              )}

              {/* Chap tomondagi status rangli ustun — 5m dan asosiy signal */}
              <span
                className="absolute inset-y-0 left-0 z-10 w-1.5 rounded-l-2xl transition-colors duration-700"
                style={{ background: status.color }}
              />

              {/* Dekorativ katta suv-belgi ikonka (kreativ identifikator) */}
              <Icon
                className="pointer-events-none absolute -bottom-7 -right-5 z-0 h-44 w-44 rotate-12"
                style={{ color: status.color, opacity: 0.06 }}
              />

              {/* ── Yuqori satr: chapda katta nom+status, o'ngda katta son ── */}
              <div className="relative z-10 flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4">
                {/* Chap: rangli ikonka tile + katta nom + katta status/norma */}
                <div className="flex min-w-0 items-start gap-3.5">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border sm:h-14 sm:w-14"
                    style={{
                      backgroundColor: status.bgColor,
                      borderColor: `${status.color}55`,
                      boxShadow: `0 8px 24px -8px ${status.color}`,
                    }}
                  >
                    <Icon className="h-7 w-7 sm:h-8 sm:w-8" style={{ color: status.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">
                        {cfg.label}
                      </h2>
                      {cfg.isFake && (
                        <span className="shrink-0 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                          Namunaviy
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <SensorStatusBadge
                        sensorKey={cfg.key}
                        value={cfg.key === 'heating' ? dT : s0.latest}
                        size="lg"
                      />
                      {cfg.nominal != null && (
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-sm font-semibold text-slate-300">
                          norma {cfg.nominal} {cfg.unit}
                        </span>
                      )}
                      {cfg.key === 'heating' && (
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-sm font-semibold text-slate-300">
                          norma ΔT {HEATING_DELTA_NORMA}°C
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* O'ng: katta son (status endi chapdagi katta pill'da) */}
                <div className="flex shrink-0 flex-col items-end text-right">
                  {single ? (
                    <>
                      <span
                        key={s0.latest ?? 'na'}
                        className="value-tick inline-flex items-baseline gap-1.5 transition-colors duration-500"
                      >
                        <span
                          className="font-sans font-bold leading-none tabular-nums tracking-[-0.02em] text-[clamp(2.5rem,5vw,4.25rem)]"
                          style={{ color: heroColor, textShadow: `0 0 40px ${heroColor}33` }}
                        >
                          {s0.latest != null ? <AnimatedNumber value={s0.latest} decimals={decimals} /> : '—'}
                        </span>
                        <span className="text-lg font-semibold text-slate-400 sm:text-xl">{cfg.unit}</span>
                      </span>

                      {TrendIcon && s0.trend != null && (
                        <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-slate-400">
                          <TrendIcon className="h-4 w-4" />
                          {s0.trend > 0 ? '+' : ''}
                          {s0.trend.toFixed(decimals)} {cfg.unit}
                        </span>
                      )}
                    </>
                  ) : (
                    /* Qozonxona: ΔT qahramon raqam + Kirish/Chiqish kichik satr */
                    <>
                      <span
                        key={dT ?? 'na'}
                        className="value-tick inline-flex items-baseline gap-1.5 transition-colors duration-500"
                      >
                        <span
                          className="font-sans font-bold leading-none tabular-nums tracking-[-0.02em] text-[clamp(2.5rem,5vw,4.25rem)]"
                          style={{ color: heroColor, textShadow: `0 0 40px ${heroColor}33` }}
                        >
                          {dT != null ? <AnimatedNumber value={dT} decimals={1} /> : '—'}
                        </span>
                        <span className="text-lg font-semibold text-slate-400 sm:text-xl">°C ΔT</span>
                      </span>

                      <div className="mt-1.5 flex gap-2 tabular-nums">
                        <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 text-sm">
                          <span className="text-slate-500">Kir </span>
                          <span className="font-bold text-cyan-300">
                            {cfg.series[0].latest != null ? (
                              <AnimatedNumber value={cfg.series[0].latest} decimals={1} suffix="°" />
                            ) : (
                              '—'
                            )}
                          </span>
                        </span>
                        <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 text-sm">
                          <span className="text-slate-500">Chiq </span>
                          <span className="font-bold text-sky-300">
                            {cfg.series[1]?.latest != null ? (
                              <AnimatedNumber value={cfg.series[1].latest} decimals={1} suffix="°" />
                            ) : (
                              '—'
                            )}
                          </span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Chart: qolgan vertikal joyni to'liq egallaydi (kattaroq) ── */}
              <div className="relative z-10 flex min-h-0 flex-1 flex-col px-2 pb-3">
                <div className="mb-1 flex items-center justify-between px-3 text-[11px] text-slate-500">
                  <span>Oxirgi 24 soatlik dinamika</span>
                  <span>{cfg.points.length} ta o'lchov</span>
                </div>

                <div className="min-h-0 w-full flex-1">
                  {chartStyle === 'dots' ? (
                    /* ── LENTA: 24 soatlik status timeline (rangli segmentlar) ── */
                    <div className="flex h-full w-full items-center gap-[2px] px-1">
                      {chartData.map((entry: any, index: number) => (
                        <div
                          key={index}
                          className="h-2/3 min-w-[2px] flex-1 rounded-full transition-colors duration-500"
                          style={{ background: cellColorFor(entry) }}
                          title={entry.label}
                        />
                      ))}
                    </div>
                  ) : chartStyle === 'gauge' ? (
                    /* ── RADIAL: spidometr (joriy qiymat vs oraliq) ── */
                    <div className="relative h-full w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          innerRadius="60%"
                          outerRadius="100%"
                          data={[{ value: gaugePct }]}
                          startAngle={220}
                          endAngle={-40}
                        >
                          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                          <RadialBar
                            background={{ fill: 'rgba(255,255,255,0.06)' }}
                            dataKey="value"
                            cornerRadius={12}
                            fill={heroColor}
                            angleAxisId={0}
                            isAnimationActive={false}
                          />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold" style={{ color: heroColor }}>
                          {status.label}
                        </span>
                        {cfg.nominal != null && (
                          <span className="mt-0.5 text-xs text-slate-500">
                            norma {cfg.nominal}
                            {cfg.unit === '%' ? '%' : ` ${cfg.unit}`}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    {chartStyle === 'area' ? (
                      /* ── MAYDON (Area) ── */
                      <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 6, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`area-${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={cfg.key === 'heating' ? '#06B6D4' : heroColor} stopOpacity={0.55} />
                            <stop offset="100%" stopColor={cfg.key === 'heating' ? '#06B6D4' : heroColor} stopOpacity={0.04} />
                          </linearGradient>
                          <linearGradient id={`area-${cfg.key}-2`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" hide />
                        <YAxis hide domain={yDomain} />
                        {cfg.key === 'heating' ? (
                          <>
                            <Area type="monotone" dataKey="v0" stroke="#06B6D4" strokeWidth={2} fill={`url(#area-${cfg.key})`} dot={false} isAnimationActive={false} connectNulls />
                            <Area type="monotone" dataKey="v1" stroke="#38BDF8" strokeWidth={2} fill={`url(#area-${cfg.key}-2)`} dot={false} isAnimationActive={false} connectNulls />
                          </>
                        ) : (
                          <Area
                            type="monotone"
                            dataKey={mainKey}
                            stroke={heroColor}
                            strokeWidth={2.5}
                            fill={`url(#area-${cfg.key})`}
                            baseValue={isElec ? 0 : undefined}
                            dot={false}
                            isAnimationActive={false}
                            connectNulls
                          />
                        )}
                        {normaLines}
                      </AreaChart>
                    ) : chartStyle === 'line' ? (
                      /* ── CHIZIQ (Line) ── */
                      <LineChart data={chartData} margin={{ top: 12, right: 8, left: 6, bottom: 0 }}>
                        <XAxis dataKey="label" hide />
                        <YAxis hide domain={yDomain} />
                        {cfg.key === 'heating' ? (
                          <>
                            <Line type="monotone" dataKey="v0" stroke="#06B6D4" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
                            <Line type="monotone" dataKey="v1" stroke="#38BDF8" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
                          </>
                        ) : (
                          <Line
                            type="monotone"
                            dataKey={mainKey}
                            stroke={heroColor}
                            strokeWidth={3}
                            dot={false}
                            activeDot={false}
                            isAnimationActive={false}
                            connectNulls
                          />
                        )}
                        {normaLines}
                      </LineChart>
                    ) : chartStyle === 'lollipop' ? (
                      /* ── NUQTALI (Lollipop) — poya + kalla nuqta ── */
                      <BarChart data={chartData} margin={{ top: 12, right: 8, left: 6, bottom: 0 }}>
                        <XAxis dataKey="label" hide />
                        <YAxis hide domain={yDomain} />
                        {cfg.key === 'heating' ? (
                          <>
                            <Bar dataKey="v0" shape={LolliShape} fill="#06B6D4" isAnimationActive={false} />
                            <Bar dataKey="v1" shape={LolliShape} fill="#38BDF8" isAnimationActive={false} />
                          </>
                        ) : (
                          <Bar dataKey={mainKey} shape={LolliShape} isAnimationActive={false}>
                            {chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={cellColorFor(entry)} />
                            ))}
                          </Bar>
                        )}
                        {normaLines}
                      </BarChart>
                    ) : (
                      /* ── USTUN (Bar) ── */
                      <BarChart data={chartData} margin={{ top: 12, right: 8, left: 6, bottom: 0 }}>
                        <XAxis dataKey="label" hide />
                        <YAxis hide domain={yDomain} />
                        {cfg.key === 'heating' ? (
                          <>
                            <Bar dataKey="v0" name="v0" fill="#06B6D4" radius={[3, 3, 0, 0]} maxBarSize={8} />
                            <Bar dataKey="v1" name="v1" fill="#38BDF8" radius={[3, 3, 0, 0]} maxBarSize={8} />
                          </>
                        ) : (
                          <Bar
                            dataKey={mainKey}
                            radius={isElec ? [3, 3, 3, 3] : [3, 3, 0, 0]}
                            maxBarSize={isElec ? 8 : 10}
                          >
                            {chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={cellColorFor(entry)} />
                            ))}
                          </Bar>
                        )}
                        {normaLines}
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
