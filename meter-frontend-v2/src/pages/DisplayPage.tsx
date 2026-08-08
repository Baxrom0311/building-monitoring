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
import { Droplets, Flame, RefreshCw, Sprout, Thermometer, Volume2, Zap } from 'lucide-react'
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

const CHARTS = [
  {
    key: 'electricity' as const,
    dataKey: 'avg_voltage_l1' as keyof HourlyUtilityStat,
    label: 'Elektr kuchlanishi',
    unit: 'V',
    icon: Zap,
    color: '#FACC15',
    glow: 'rgba(250,204,21,0.35)',
    bg: 'from-yellow-950/60 to-slate-950/80',
    nominal: 220 as number | null,
  },
  {
    key: 'water' as const,
    dataKey: 'avg_pressure_bottom_bar' as keyof HourlyUtilityStat,
    label: 'Suv bosimi',
    unit: 'bar',
    icon: Droplets,
    color: '#22D3EE',
    glow: 'rgba(34,211,238,0.35)',
    bg: 'from-cyan-950/60 to-slate-950/80',
    nominal: null as number | null,
  },
  {
    key: 'gas' as const,
    dataKey: 'avg_pressure_bar' as keyof HourlyUtilityStat,
    label: 'Gaz bosimi',
    unit: 'bar',
    icon: Flame,
    color: '#FB923C',
    glow: 'rgba(251,146,60,0.35)',
    bg: 'from-orange-950/60 to-slate-950/80',
    nominal: null as number | null,
  },
  {
    key: 'soil' as const,
    dataKey: 'avg_humidity' as keyof HourlyUtilityStat,
    label: "Yerto'la namligi",
    unit: '%',
    icon: Sprout,
    color: '#22C55E',
    glow: 'rgba(34,197,94,0.35)',
    bg: 'from-green-950/60 to-slate-950/80',
    nominal: null as number | null,
  },
  {
    key: 'sound' as const,
    dataKey: 'avg_level' as keyof HourlyUtilityStat,
    label: 'Ovoz darajasi',
    unit: '%',
    icon: Volume2,
    color: '#A855F7',
    glow: 'rgba(168,85,247,0.35)',
    bg: 'from-purple-950/60 to-slate-950/80',
    nominal: null as number | null,
  },
  {
    key: 'heating' as const,
    dataKey: 'avg_temperature_in_c' as keyof HourlyUtilityStat,
    label: 'Qozonxona kirish harorati',
    unit: '°C',
    icon: Thermometer,
    color: '#F97316',
    glow: 'rgba(249,115,22,0.35)',
    bg: 'from-orange-950/60 to-slate-950/80',
    nominal: null as number | null,
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

  const charts = CHARTS.map((cfg) => ({
    ...cfg,
    // data[cfg.key] serverdan kelmasa ham sahifa yiqilmasligi uchun ?? [] guard
    points: data ? buildPoints(data[cfg.key] ?? [], cfg.dataKey) : [],
    latest: data
      ? (() => {
          const arr = data[cfg.key] ?? []
          if (!arr.length) return null
          const sorted = [...arr].sort((a, b) => b.bucket_ts - a.bucket_ts)
          const v = sorted[0][cfg.dataKey] as number | null
          return v != null ? Number(v.toFixed(2)) : null
        })()
      : null,
  }))

  return (
    <div className="flex h-screen w-screen select-none flex-col overflow-hidden bg-slate-950 text-white">
      {/* Sarlavha */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800/60 bg-slate-950/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-xl font-extrabold tracking-tight text-white">
              {data?.building?.name ?? 'SmartBino'}
            </div>
            <div className="text-xs text-slate-400">
              {data?.building
                ? (data.building.address ?? 'Bino monitoringi')
                : 'Kommunal monitoring tizimi — barcha binolar'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Bino tanlagich — displey bino kesimida ko'rsatiladi */}
          {data?.buildings && data.buildings.length > 0 && (
            <select
              value={BUILDING_ID ?? ''}
              onChange={(e) => {
                const v = e.target.value
                window.location.search = v ? `?building_id=${v}` : ''
              }}
              className="max-w-[220px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500"
            >
              <option value="">Barcha binolar</option>
              {data.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-3 text-slate-400">
            <LiveDot ok={online} />
            {lastUpdate && (
              <span className="hidden text-xs sm:block">
                Yangilandi:{' '}
                {lastUpdate.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button onClick={fetchData} className="rounded-lg p-1.5 transition-colors hover:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <LiveClock />
        </div>
      </header>

      {/* Grafiklar — 5 teng qator */}
      <div className="grid flex-1 grid-rows-6 gap-0 overflow-hidden">
        {charts.map((cfg) => {
          const Icon = cfg.icon
          const hasData = cfg.points.some((p) => p.value != null)

          return (
            <div
              key={cfg.key}
              className={`relative flex flex-col overflow-hidden border-b border-slate-800/40 bg-gradient-to-r ${cfg.bg}`}
            >
              {/* Glow */}
              <div
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{ background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${cfg.glow}, transparent)` }}
              />

              {/* Sarlavha */}
              <div className="relative z-10 flex shrink-0 items-center justify-between px-8 pb-2 pt-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: cfg.glow, border: `1px solid ${cfg.color}40` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: cfg.color }} />
                  </div>
                  <div>
                    <div className="text-base font-extrabold text-white">{cfg.label}</div>
                    <div className="text-xs text-slate-400">Oxirgi 24 soat</div>
                  </div>
                </div>

                {/* Joriy qiymat */}
                <div className="text-right">
                  <div className="font-mono text-4xl font-black tabular-nums" style={{ color: cfg.color }}>
                    {cfg.latest != null ? (
                      <AnimatedNumber value={cfg.latest} decimals={2} />
                    ) : (
                      '—'
                    )}
                    <span className="ml-1.5 text-xl font-bold text-slate-400">{cfg.unit}</span>
                  </div>
                  {cfg.nominal != null && (
                    <div className="text-xs text-slate-500">
                      nominal: {cfg.nominal} {cfg.unit}
                    </div>
                  )}
                </div>
              </div>

              {/* Grafik */}
              <div className="relative z-10 min-h-0 flex-1 px-4 pb-3">
                {!hasData ? (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-sm text-slate-500">O'lchov ma'lumoti kutilmoqda...</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cfg.points} margin={{ top: 4, right: 24, left: 0, bottom: 0 }} barCategoryGap="25%">
                      <defs>
                        <linearGradient id={`kiosk_${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={cfg.color} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={cfg.color} stopOpacity={0.35} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 8" stroke="rgba(148,163,184,0.08)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={(v) => `${v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#0f172a',
                          border: `1px solid ${cfg.color}40`,
                          borderRadius: 10,
                          fontSize: 13,
                          color: '#f1f5f9',
                        }}
                        labelStyle={{ color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}
                        formatter={(v) => [`${Number(v ?? 0)} ${cfg.unit}`, cfg.label]}
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      />
                      {cfg.nominal != null && (
                        <ReferenceLine
                          y={cfg.nominal}
                          stroke={cfg.color}
                          strokeDasharray="6 4"
                          strokeOpacity={0.4}
                          label={{ value: `${cfg.nominal}${cfg.unit}`, fill: cfg.color, fontSize: 10, opacity: 0.6 }}
                        />
                      )}
                      <Bar dataKey="value" fill={`url(#kiosk_${cfg.key})`} radius={[5, 5, 0, 0]} maxBarSize={26} />
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
