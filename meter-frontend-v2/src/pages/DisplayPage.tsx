import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  RefreshCw,
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

function buildPoints(stats: HourlyUtilityStat[], key: keyof HourlyUtilityStat): ChartPoint[] {
  const map = new Map<number, { sum: number; n: number }>()
  for (const s of stats) {
    const v = s[key] as number | null
    if (v == null) continue
    const cur = map.get(s.bucket_ts) ?? { sum: 0, n: 0 }
    cur.sum += v
    cur.n += 1
    map.set(s.bucket_ts, cur)
  }

  const now = Math.floor(Date.now() / 1000)
  const start = now - 24 * 3600
  const points: ChartPoint[] = []

  for (let ts = start - (start % 3600); ts <= now; ts += 3600) {
    const entry = map.get(ts)
    points.push({
      label: fmt(ts),
      value: entry ? Number((entry.sum / entry.n).toFixed(2)) : null,
    })
  }
  return points
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
  return points
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
    color: '#38BDF8',
    glow: 'rgba(56,189,248,0.5)',
    bg: 'from-sky-500/20 via-slate-900/80 to-slate-950',
    nominal: 4 as number | null,
    // Real ma'lumot bo'lmasa — normal suv bosimi (~4 bar) namunaviy ko'rsatiladi
    fake: { base: 4, amp: 0.25 } as { base: number; amp: number } | null,
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
    // Real ma'lumot bo'lmasa — normal gaz bosimi (~0.3 bar) namunaviy ko'rsatiladi
    fake: { base: 0.3, amp: 0.03 } as { base: number; amp: number } | null,
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
    nominal: null as number | null,
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
    nominal: 60 as number | null,
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

  const charts = CHARTS.map((cfg) => {
    // data[cfg.key] serverdan kelmasa ham sahifa yiqilmasligi uchun ?? [] guard
    let points = data ? buildPoints(data[cfg.key] ?? [], cfg.dataKey) : []
    const hasReal = points.some((p) => p.value != null)
    // Real ma'lumot yo'q, lekin fake sozlangan bo'lsa (suv/gaz) — namunaviy bosim ko'rsatiladi
    let isFake = false
    if (!hasReal && cfg.fake && data) {
      points = fakePoints(cfg.fake.base, cfg.fake.amp)
      isFake = true
    }
    // Oxirgi ikki mavjud (null bo'lmagan) qiymat orqali joriy qiymat + trend
    const vals = points.map((p) => p.value).filter((v): v is number => v != null)
    const latest = vals.length ? vals[vals.length - 1] : null
    const prev = vals.length > 1 ? vals[vals.length - 2] : null
    const trend = latest != null && prev != null ? latest - prev : null
    return { ...cfg, points, latest, trend, isFake }
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
            <button
              onClick={fetchData}
              className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <LiveClock />
        </div>
      </header>

      {/* Grafiklar — to'liq ekranni to'ldiradigan 3×2 grid (bo'sh joy qolmaydi) */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {charts.map((cfg) => {
          const Icon = cfg.icon
          const hasData = cfg.points.some((p) => p.value != null)
          const TrendIcon = cfg.trend == null || cfg.trend === 0 ? null : cfg.trend > 0 ? TrendingUp : TrendingDown

          return (
            <div
              key={cfg.key}
              className="group relative flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-white/[0.05]"
            >
              {/* Tepa aksent chizig'i */}
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }}
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
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border"
                    style={{ background: cfg.glow, borderColor: `${cfg.color}55`, boxShadow: `0 8px 24px -8px ${cfg.color}` }}
                  >
                    <Icon className="h-7 w-7" style={{ color: cfg.color }} />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{cfg.label}</div>
                    <div className="text-xs text-slate-400">{cfg.isFake ? 'Namunaviy · normal bosim' : 'Oxirgi 24 soat'}</div>
                  </div>
                </div>
                <span
                  className={`h-3 w-3 rounded-full ${hasData ? 'animate-pulse' : ''}`}
                  style={{ background: hasData ? cfg.color : '#475569', boxShadow: hasData ? `0 0 14px ${cfg.color}` : 'none' }}
                />
              </div>

              {/* Joriy qiymat + trend */}
              <div className="relative z-10 flex shrink-0 items-end justify-between gap-3 px-6 pt-1">
                <div className="font-mono text-6xl font-black tabular-nums leading-none" style={{ color: cfg.color }}>
                  {cfg.latest != null ? (
                    <AnimatedNumber value={cfg.latest} decimals={2} />
                  ) : (
                    '—'
                  )}
                  <span className="ml-2 text-2xl font-bold text-slate-400">{cfg.unit}</span>
                </div>
                {TrendIcon && cfg.trend != null && (
                  <div
                    className="mb-1 flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold"
                    style={{ background: `${cfg.color}1a`, color: cfg.color }}
                  >
                    <TrendIcon className="h-4 w-4" />
                    {Math.abs(cfg.trend).toFixed(1)}
                  </div>
                )}
              </div>
              {cfg.nominal != null && (
                <div className="relative z-10 px-6 pt-1 text-xs text-slate-500">
                  nominal: {cfg.nominal} {cfg.unit}
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
                    <BarChart data={cfg.points} margin={{ top: 6, right: 16, left: 0, bottom: 0 }} barCategoryGap="20%">
                      <defs>
                        <linearGradient id={`kiosk_${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={cfg.color} stopOpacity={1} />
                          <stop offset="100%" stopColor={cfg.color} stopOpacity={0.3} />
                        </linearGradient>
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
                        domain={['auto', 'auto']}
                        tickFormatter={(v) => `${v}`}
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
                        formatter={(v) => [`${Number(v ?? 0)} ${cfg.unit}`, cfg.label]}
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      />
                      {cfg.nominal != null && (
                        <ReferenceLine
                          y={cfg.nominal}
                          stroke={cfg.color}
                          strokeDasharray="6 5"
                          strokeWidth={1.5}
                          strokeOpacity={0.7}
                          label={{
                            value: `norma ${cfg.nominal}${cfg.unit}`,
                            position: 'insideTopRight',
                            fill: cfg.color,
                            fontSize: 11,
                            fontWeight: 700,
                            opacity: 0.85,
                          }}
                        />
                      )}
                      <Bar dataKey="value" fill={`url(#kiosk_${cfg.key})`} radius={[6, 6, 0, 0]} maxBarSize={28} />
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
