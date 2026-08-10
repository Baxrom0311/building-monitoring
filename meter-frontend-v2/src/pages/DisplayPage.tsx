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
  RefreshCw,
  RotateCw,
  Sprout,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Volume2,
  Zap,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/env'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { StatusPulse } from '@/components/ui/StatusPulse'
import { SoilStatusBadge, getSoilHumidityStatus } from '@/components/ui/SoilStatusBadge'
import { SensorStatusBadge } from '@/components/ui/SensorStatus'
import type { HourlyUtilityStat } from '@/types/api'

// PUBLIC kiosk sahifa — AppLayout tashqarisida, autentifikatsiyasiz.
// O'z qorong'i konteyner uslubini saqlaydi (katta ekran/TV rejimi).

const BASE = API_BASE_URL || window.location.origin

interface DisplayData {
  building?: { id: number; name: string; address?: string | null } | null
  buildings?: { id: number; name: string }[]
  electricity: HourlyUtilityStat[]
  water: HourlyUtilityStat[]
  gas: HourlyUtilityStat[]
  soil: HourlyUtilityStat[]
  sound: HourlyUtilityStat[]
  heating?: HourlyUtilityStat[]
}

// ?building_id=3 bo'lsa kiosk faqat shu bino ma'lumotini ko'rsatadi
const BUILDING_ID = new URLSearchParams(window.location.search).get('building_id')

interface ChartPoint {
  label: string
  value: number | null
}

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
}

// Bir nechta seriya (masalan qozonxona kirish+chiqish) uchun soatlik o'rtacha.
// Har bir nuqta: { label, v0, v1, ... } — Bar dataKey={`v${i}`} bilan chiziladi.
type MultiPoint = { label: string } & Record<`v${number}`, number | null>
function buildMultiPoints(stats: HourlyUtilityStat[], keys: (keyof HourlyUtilityStat)[]): MultiPoint[] {
  const maps = keys.map(() => new Map<number, { sum: number; n: number }>())
  for (const s of stats) {
    keys.forEach((k, i) => {
      const v = s[k] as number | null
      if (v == null) return
      const cur = maps[i].get(s.bucket_ts) ?? { sum: 0, n: 0 }
      cur.sum += v
      cur.n += 1
      maps[i].set(s.bucket_ts, cur)
    })
  }
  const now = Math.floor(Date.now() / 1000)
  const start = now - 24 * 3600
  const points: MultiPoint[] = []
  for (let ts = start - (start % 3600); ts <= now; ts += 3600) {
    const p = { label: fmt(ts) } as MultiPoint
    keys.forEach((_, i) => {
      const e = maps[i].get(ts)
      p[`v${i}`] = e ? Number((e.sum / e.n).toFixed(2)) : null
    })
    points.push(p)
  }
  return points
}

// Elektr uchun: 220V normadan chetlanishga qarab rang (yashil→sariq→qizil).
// dev=0 (aynan 220V) yashil, dev=1 (±25V va undan uzoq) qizil, o'rtada sariq.
const ELEC_NOMINAL = 220
const ELEC_MAX_DEV = 25
const _lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
function voltageColor(v: number): string {
  const dev = Math.min(Math.abs(v - ELEC_NOMINAL) / ELEC_MAX_DEV, 1)
  const green = [34, 197, 94]
  const yellow = [250, 204, 21]
  const red = [239, 68, 68]
  let c: number[]
  if (dev < 0.5) {
    const t = dev / 0.5
    c = [_lerp(green[0], yellow[0], t), _lerp(green[1], yellow[1], t), _lerp(green[2], yellow[2], t)]
  } else {
    const t = (dev - 0.5) / 0.5
    c = [_lerp(yellow[0], red[0], t), _lerp(yellow[1], red[1], t), _lerp(yellow[2], red[2], t)]
  }
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

// Real ma'lumot bo'lmaganda namunaviy (fake) qatorlar yaratadi.
// Soat timestampiga bog'liq deterministik — har 30s yangilanishda sakramaydi.
function fakePoints(base: number, amp: number): ChartPoint[] {
  const now = Math.floor(Date.now() / 1000)
  const start = now - 24 * 3600
  const points: ChartPoint[] = []
  for (let ts = start - (start % 3600); ts <= now; ts += 3600) {
    const h = Math.floor(ts / 3600)
    const wave = Math.sin(h * 0.7) * 0.6 + Math.sin(h * 1.9) * 0.4
    const v = base + wave * amp
    points.push({ label: fmt(ts), value: Number(v.toFixed(2)) })
  }
  // Ko'rsatiladigan joriy (oxirgi) qiymat aynan bazaga teng bo'lsin
  if (points.length) points[points.length - 1].value = Number(base.toFixed(2))
  return points
}

// Qozonxona normal ΔT (kirish-chiqish farqi) va ruxsat etilgan chetlanish
const HEATING_DELTA_NORMA = 20
const HEATING_DELTA_MARGIN = 10 // norma ±10°C ichida — sog'lom

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
    color: '#38BDF8',
    glow: 'rgba(56,189,248,0.5)',
    bg: 'from-sky-500/20 via-slate-900/80 to-slate-950',
    nominal: 4 as number | null,
    // Real ma'lumot bo'lmasa — normal suv bosimi (~3.8 bar) namunaviy ko'rsatiladi
    fake: { base: 3.8, amp: 0.25 } as { base: number; amp: number } | null,
  },
  {
    key: 'gas' as const,
    dataKey: 'avg_pressure_bar' as keyof HourlyUtilityStat,
    label: 'Gaz bosimi',
    unit: 'bar',
    icon: Flame,
    color: '#FB923C',
    glow: 'rgba(251,146,60,0.5)',
    bg: 'from-orange-500/20 via-slate-900/80 to-slate-950',
    nominal: 0.3 as number | null,
    // Real ma'lumot bo'lmasa — normal gaz bosimi (~0.27 bar) namunaviy ko'rsatiladi
    fake: { base: 0.27, amp: 0.03 } as { base: number; amp: number } | null,
  },
  {
    key: 'soil' as const,
    dataKey: 'avg_humidity' as keyof HourlyUtilityStat,
    label: "Yerto'la namligi",
    unit: '%',
    icon: Sprout,
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
    label: 'Qozonxona kirish harorati',
    unit: '°C',
    icon: Thermometer,
    color: '#FB7185',
    glow: 'rgba(251,113,133,0.5)',
    bg: 'from-rose-500/20 via-slate-900/80 to-slate-950',
    // Qozonxona normasi ΔT (kirish-chiqish farqi) orqali baholanadi — HEATING_DELTA_NORMA
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
    <div className="text-right">
      <div className="font-mono text-3xl font-bold tabular-nums text-white">
        {time.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="mt-0.5 text-xs text-slate-400">
        {time.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
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
      window.location.search = `?building_id=${nextId}`
    }, 15_000)
    return () => clearInterval(interval)
  }, [autoRotate, data])

  const charts = CHARTS.map((cfg) => {
    // Qozonxona uchun ikki seriya (kirish yashil, chiqish qizil), qolganlar bitta seriya
    const seriesDefs =
      cfg.key === 'heating'
        ? [
            { key: 'avg_temperature_in_c' as keyof HourlyUtilityStat, label: 'Kirish', color: '#34D399' },
            { key: 'avg_temperature_out_c' as keyof HourlyUtilityStat, label: 'Chiqish', color: '#F87171' },
          ]
        : [{ key: cfg.dataKey, label: cfg.label, color: cfg.color }]

    // data[cfg.key] serverdan kelmasa ham sahifa yiqilmasligi uchun ?? [] guard
    let points = data ? buildMultiPoints(data[cfg.key] ?? [], seriesDefs.map((s) => s.key)) : []
    const hasReal = points.some((p) => seriesDefs.some((_, i) => p[`v${i}`] != null))
    // Real ma'lumot yo'q, lekin fake sozlangan bo'lsa (suv/gaz) — namunaviy bosim ko'rsatiladi
    let isFake = false
    if (!hasReal && cfg.fake && data) {
      points = fakePoints(cfg.fake.base, cfg.fake.amp).map((p) => ({ label: p.label, v0: p.value }))
      isFake = true
    }

    // Har bir seriya uchun joriy qiymat + trend
    const series = seriesDefs.map((sd, i) => {
      const vals = points.map((p) => p[`v${i}`]).filter((v): v is number => v != null)
      const latest = vals.length ? vals[vals.length - 1] : null
      const prev = vals.length > 1 ? vals[vals.length - 2] : null
      return { ...sd, index: i, latest, trend: latest != null && prev != null ? latest - prev : null }
    })
    // Qozonxona uchun ΔT = |kirish - chiqish|
    const deltaT =
      cfg.key === 'heating' && series[0].latest != null && series[1].latest != null
        ? Math.abs(series[0].latest - series[1].latest)
        : null
    return { ...cfg, points, series, isFake, deltaT }
  })

  return (
    <div className="relative flex h-screen w-screen select-none flex-col overflow-hidden bg-slate-950 text-white">
      {/* Ambient fon — yumshoq rangli nurlar */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-cyan-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Sarlavha */}
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-4 border-b border-white/5 bg-slate-950/60 px-8 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/40 ring-1 ring-white/10">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-2xl font-extrabold tracking-tight text-white">
              {data?.building?.name ?? 'SmartBino'}
            </div>
            <div className="text-xs text-slate-400">
              {data?.building
                ? (data.building.address ?? 'Bino monitoringi')
                : 'Kommunal monitoring tizimi — barcha binolar'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* Bino tanlagich — displey bino kesimida ko'rsatiladi */}
          {data?.buildings && data.buildings.length > 0 && (
            <select
              value={BUILDING_ID ?? ''}
              onChange={(e) => {
                const v = e.target.value
                window.location.search = v ? `?building_id=${v}` : ''
              }}
              className="max-w-[220px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none backdrop-blur transition-colors hover:border-white/20 focus:border-blue-500"
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
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-400 backdrop-blur">
            <LiveDot ok={online} />
            {lastUpdate && (
              <span className="hidden text-xs sm:block">
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
                <span className="hidden md:inline">{autoRotate ? 'Auto: ON' : 'Auto: OFF'}</span>
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
          <LiveClock />
        </div>
      </header>

      {/* Grafiklar — to'liq ekranni to'ldiradigan 3×2 grid (bo'sh joy qolmaydi) */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {charts.map((cfg) => {
          const Icon = cfg.icon
          const hasData = cfg.series.some((s) => s.latest != null)
          const single = cfg.series.length === 1
          const s0 = cfg.series[0]
          const TrendIcon =
            single && s0.trend != null && s0.trend !== 0 ? (s0.trend > 0 ? TrendingUp : TrendingDown) : null

          // Elektr: 220V o'rtada nol chizig'i — past qiymat pastga, yuqori qiymat tepaga o'sadi (divergent).
          // Ustun qiymati sifatida (voltaj − 220) chiziladi, Y o'qi 0 atrofida simmetrik.
          const isElec = cfg.key === 'electricity'
          const elecVals = isElec
            ? cfg.points.map((p) => p.v0).filter((n): n is number => typeof n === 'number')
            : []
          const elecSpan = elecVals.length ? Math.max(15, ...elecVals.map((v) => Math.abs(v - ELEC_NOMINAL))) : 20
          // Simmetrik domen — 0 (=220V) aynan o'rtada
          const elecDomain: [number, number] = [-(elecSpan + 5), elecSpan + 5]
          const elecData = isElec
            ? cfg.points.map((p) => ({
                ...p,
                v0: p.v0,
                dev: p.v0 != null ? Number((p.v0 - ELEC_NOMINAL).toFixed(2)) : null,
              }))
            : []
          const soilStatus = cfg.key === 'soil' ? getSoilHumidityStatus(s0.latest) : null
          const valueColor =
            isElec && s0.latest != null
              ? voltageColor(s0.latest)
              : cfg.key === 'soil' && soilStatus
              ? soilStatus.color
              : cfg.color

          return (
            <div
              key={cfg.key}
              className="group relative flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-white/[0.05]"
            >
              {/* Tepa aksent chizig'i */}
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{
                  background: `linear-gradient(90deg, transparent, ${cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color}, transparent)`,
                }}
              />
              {/* Glow */}
              <div
                className="pointer-events-none absolute inset-0 opacity-50 transition-opacity duration-300 group-hover:opacity-70"
                style={{ background: `radial-gradient(ellipse 90% 55% at 50% 0%, ${cfg.glow}, transparent)` }}
              />

              {/* Sarlavha */}
              <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-6 pb-1 pt-5">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border transition-all"
                    style={{
                      background: cfg.key === 'soil' && soilStatus ? soilStatus.bgColor : cfg.glow,
                      borderColor: cfg.key === 'soil' && soilStatus ? soilStatus.borderColor : `${cfg.color}55`,
                      boxShadow: `0 8px 24px -8px ${cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color}`,
                    }}
                  >
                    <Icon className="h-7 w-7" style={{ color: cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white">{cfg.label}</span>
                      {hasData && cfg.key !== 'heating' && (
                        <SensorStatusBadge sensorKey={cfg.key} value={s0.latest} size="sm" />
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{cfg.isFake ? 'Namunaviy · normal bosim' : 'Oxirgi 24 soat'}</div>
                  </div>
                </div>
                <span
                  className={`h-3 w-3 rounded-full ${hasData ? 'animate-pulse' : ''}`}
                  style={{
                    background: hasData ? (cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color) : '#475569',
                    boxShadow: hasData ? `0 0 14px ${cfg.key === 'soil' && soilStatus ? soilStatus.color : cfg.color}` : 'none',
                  }}
                />
              </div>

              {/* Joriy qiymat(lar) + trend */}
              {single ? (
                <>
                  <div className="relative z-10 flex shrink-0 items-end justify-between gap-3 px-6 pt-1">
                    <div className="font-mono text-6xl font-black tabular-nums leading-none" style={{ color: valueColor }}>
                      {s0.latest != null ? <AnimatedNumber value={s0.latest} decimals={1} /> : '—'}
                      <span className="ml-2 text-2xl font-bold text-slate-400">{cfg.unit}</span>
                    </div>
                    {TrendIcon && s0.trend != null && (
                      <div
                        className="mb-1 flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold"
                        style={{ background: `${cfg.color}1a`, color: cfg.color }}
                      >
                        <TrendIcon className="h-4 w-4" />
                        {Math.abs(s0.trend).toFixed(1)}
                      </div>
                    )}
                  </div>

                  {cfg.key === 'soil' ? (
                    <div className="relative z-10 px-6 pt-2">
                      <SoilStatusBadge value={s0.latest} showScale={true} />
                    </div>
                  ) : cfg.nominal != null ? (
                    <div className="relative z-10 px-6 pt-1 text-xs text-slate-500">
                      nominal: {cfg.nominal} {cfg.unit}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="relative z-10 flex shrink-0 flex-wrap items-end gap-x-7 gap-y-1 px-6 pt-1">
                  {cfg.series.map((s) => (
                    <div key={s.index}>
                      <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: s.color }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </div>
                      <div className="font-mono text-4xl font-black tabular-nums leading-none" style={{ color: s.color }}>
                        {s.latest != null ? <AnimatedNumber value={s.latest} decimals={1} /> : '—'}
                        <span className="ml-1 text-lg font-bold text-slate-400">{cfg.unit}</span>
                      </div>
                    </div>
                  ))}
                  {cfg.key === 'heating' &&
                    (() => {
                      const ok = cfg.deltaT != null && Math.abs(cfg.deltaT - HEATING_DELTA_NORMA) <= HEATING_DELTA_MARGIN
                      const dColor = cfg.deltaT == null ? '#94a3b8' : ok ? '#34D399' : '#FBBF24'
                      return (
                        <div className="border-l border-white/10 pl-6">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-300">ΔT · norma {HEATING_DELTA_NORMA}°C</span>
                            <SensorStatusBadge sensorKey="heating" value={cfg.deltaT} size="sm" />
                          </div>
                          <div className="font-mono text-4xl font-black tabular-nums leading-none" style={{ color: dColor }}>
                            {cfg.deltaT != null ? <AnimatedNumber value={cfg.deltaT} decimals={1} /> : '—'}
                            <span className="ml-1 text-lg font-bold text-slate-400">{cfg.unit}</span>
                          </div>
                        </div>
                      )
                    })()}
                </div>
              )}

              {/* Grafik — qolgan bo'sh joyni to'liq to'ldiradi */}
              <div className="relative z-10 mt-2 min-h-0 flex-1 px-1 pb-1">
                {!hasData ? (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-sm text-slate-500">O'lchov ma'lumoti kutilmoqda...</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={elecData} margin={{ top: 6, right: 16, left: 0, bottom: 0 }} barCategoryGap="20%">
                      <defs>
                        {cfg.series.map((s) => (
                          <linearGradient key={s.index} id={`kiosk_${cfg.key}_${s.index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                            <stop offset="100%" stopColor={s.color} stopOpacity={0.3} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 8" stroke="rgba(148,163,184,0.08)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={40}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        domain={isElec ? elecDomain : ['auto', 'auto']}
                        allowDecimals={!isElec}
                        tickFormatter={(v) => `${isElec ? Math.round(Number(v) + ELEC_NOMINAL) : v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(15,23,42,0.9)',
                          border: `1px solid ${cfg.color}40`,
                          borderRadius: 12,
                          fontSize: 13,
                          color: '#f1f5f9',
                          backdropFilter: 'blur(8px)',
                        }}
                        labelStyle={{ color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}
                        formatter={(v, name) =>
                          isElec
                            ? [`${(Number(v ?? 0) + ELEC_NOMINAL).toFixed(1)} ${cfg.unit}`, cfg.label]
                            : [`${Number(v ?? 0)} ${cfg.unit}`, name]
                        }
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      />
                      {cfg.key === 'soil' && (
                        <>
                          <ReferenceLine
                            y={65}
                            stroke="#FBBF24"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            strokeOpacity={0.8}
                            label={{ value: "O'rta 65%", position: 'insideTopRight', fill: '#FBBF24', fontSize: 10, fontWeight: 700 }}
                          />
                          <ReferenceLine
                            y={80}
                            stroke="#FB7185"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            strokeOpacity={0.8}
                            label={{ value: 'Yomon 80%', position: 'insideTopRight', fill: '#FB7185', fontSize: 10, fontWeight: 700 }}
                          />
                        </>
                      )}
                      {(isElec || (cfg.nominal != null && cfg.key !== 'soil')) && (
                        <ReferenceLine
                          y={isElec ? 0 : cfg.nominal!}
                          stroke={isElec ? '#22C55E' : cfg.color}
                          strokeDasharray="6 5"
                          strokeWidth={isElec ? 2 : 1.5}
                          strokeOpacity={isElec ? 0.9 : 0.7}
                          label={{
                            value: isElec ? `norma ${ELEC_NOMINAL}${cfg.unit}` : `norma ${cfg.nominal}${cfg.unit}`,
                            position: 'insideTopRight',
                            fill: isElec ? '#22C55E' : cfg.color,
                            fontSize: 11,
                            fontWeight: 700,
                            opacity: 0.9,
                          }}
                        />
                      )}
                      {isElec ? (
                        <Bar dataKey="dev" name={cfg.label} radius={[4, 4, 4, 4]} maxBarSize={28}>
                          {elecData.map((p, idx) => (
                            <Cell key={idx} fill={p.v0 != null ? voltageColor(p.v0) : '#334155'} />
                          ))}
                        </Bar>
                      ) : cfg.key === 'soil' ? (
                        <Bar dataKey="v0" name={cfg.label} radius={[6, 6, 0, 0]} maxBarSize={28}>
                          {cfg.points.map((p, idx) => (
                            <Cell key={idx} fill={p.v0 != null ? getSoilHumidityStatus(p.v0).color : cfg.color} />
                          ))}
                        </Bar>
                      ) : (
                        cfg.series.map((s) => (
                          <Bar
                            key={s.index}
                            dataKey={`v${s.index}`}
                            name={s.label}
                            fill={`url(#kiosk_${cfg.key}_${s.index})`}
                            radius={[6, 6, 0, 0]}
                            maxBarSize={single ? 28 : 16}
                          />
                        ))
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
