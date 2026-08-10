import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Droplets, Sprout, TrendingDown, TrendingUp, Volume2, Zap } from 'lucide-react'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { SoilStatusBadge } from '@/components/ui/SoilStatusBadge'

// ── Types ────────────────────────────────────────────────────────────────────

interface DataPoint {
  label: string
  value: number
}

// ── Mock data generators ──────────────────────────────────────────────────────

function noise(seed: number): number {
  return (Math.sin(seed * 127.1 + 13.7) + Math.sin(seed * 74.7 + 5.2)) * 0.5
}

function generateVoltage(): DataPoint[] {
  const now = Date.now()
  return Array.from({ length: 24 }, (_, i) => {
    const ts = now - (23 - i) * 3_600_000
    const h = new Date(ts).getHours()
    const label = new Date(ts).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
    const isPeak = (h >= 7 && h <= 9) || (h >= 18 && h <= 22)
    const base = isPeak ? 211 : 221
    let value = base + noise(i) * 7
    if (i === 5) value = 244.5
    if (i === 14) value = 196.8
    if (i === 21) value = 252.1
    if (i === 3) value = 187.4
    return { label, value: +Math.max(183, Math.min(258, value)).toFixed(1) }
  })
}

function generateSoil(): DataPoint[] {
  const now = Date.now()
  return Array.from({ length: 24 }, (_, i) => {
    const ts = now - (23 - i) * 3_600_000
    const label = new Date(ts).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
    let value = 48.5 + noise(i + 150) * 12.0
    if (i === 6) value = 82.0
    if (i === 15) value = 18.5
    return { label, value: +Math.max(10.0, Math.min(95.0, value)).toFixed(1) }
  })
}

function generateSound(): DataPoint[] {
  const now = Date.now()
  return Array.from({ length: 24 }, (_, i) => {
    const ts = now - (23 - i) * 3_600_000
    const h = new Date(ts).getHours()
    const label = new Date(ts).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
    const isBusy = h >= 8 && h <= 19
    const base = isBusy ? 48.0 : 28.0
    let value = base + noise(i + 200) * 14.0
    if (i === 10) value = 72.5
    if (i === 17) value = 88.2
    return { label, value: +Math.max(0.0, Math.min(100.0, value)).toFixed(1) }
  })
}

function generateWaterPressure(): DataPoint[] {
  const now = Date.now()
  return Array.from({ length: 24 }, (_, i) => {
    const ts = now - (23 - i) * 3_600_000
    const h = new Date(ts).getHours()
    const label = new Date(ts).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
    const isPeak = (h >= 6 && h <= 9) || (h >= 19 && h <= 22)
    const base = isPeak ? 2.3 : 3.1
    let value = base + noise(i + 350) * 0.6
    if (i === 8) value = 0.9
    if (i === 16) value = 4.7
    return { label, value: +Math.max(0.0, Math.min(6.0, value)).toFixed(2) }
  })
}

// ── Threshold config ──────────────────────────────────────────────────────────

const CHARTS = [
  {
    key: 'electricity',
    label: 'Elektr kuchlanishi',
    unit: 'V',
    icon: Zap,
    color: '#FACC15',
    glow: 'rgba(250,204,21,0.28)',
    bg: 'from-yellow-950/70 to-slate-950',
    border: 'border-yellow-500/25',
    gradientId: 'grad_elec',
    nominal: 220,
    domain: [183, 258] as [number, number],
    dangerLow: 190,
    warnLow: 200,
    warnHigh: 240,
    dangerHigh: 250,
    decimals: 1,
    liveBase: 219.5,
    liveAmp: 2.5,
    getPoints: generateVoltage,
    legendRanges: [
      { label: '< 190 V', color: '#ef4444' },
      { label: '190 – 200 V', color: '#eab308' },
      { label: '200 – 240 V', color: '#22c55e' },
      { label: '240 – 250 V', color: '#eab308' },
      { label: '> 250 V', color: '#ef4444' },
    ],
  },
  {
    key: 'soil',
    label: "Yerto'la namligi",
    unit: '%',
    icon: Sprout,
    color: '#34D399',
    glow: 'rgba(52,211,153,0.28)',
    bg: 'from-emerald-950/70 to-slate-950',
    border: 'border-emerald-500/25',
    gradientId: 'grad_soil',
    nominal: 45,
    domain: [0, 100] as [number, number],
    dangerLow: 15,
    warnLow: 25,
    warnHigh: 75,
    dangerHigh: 85,
    decimals: 1,
    liveBase: 48.5,
    liveAmp: 2.0,
    getPoints: generateSoil,
    legendRanges: [
      { label: 'Norma (< 65%)', color: '#34D399' },
      { label: "O'rta (65 – 80%)", color: '#FBBF24' },
      { label: 'Yomon (> 80%)', color: '#FB7185' },
    ],
  },
  {
    key: 'sound',
    label: 'Shovqin darajasi',
    unit: '%',
    icon: Volume2,
    color: '#C084FC',
    glow: 'rgba(192,132,252,0.28)',
    bg: 'from-purple-950/70 to-slate-950',
    border: 'border-purple-500/25',
    gradientId: 'grad_sound',
    nominal: 40,
    domain: [0, 100] as [number, number],
    dangerLow: 5,
    warnLow: 10,
    warnHigh: 70,
    dangerHigh: 85,
    decimals: 1,
    liveBase: 43.2,
    liveAmp: 3.5,
    getPoints: generateSound,
    legendRanges: [
      { label: '< 5 %', color: '#ef4444' },
      { label: '5 – 10 %', color: '#eab308' },
      { label: '10 – 70 %', color: '#22c55e' },
      { label: '70 – 85 %', color: '#eab308' },
      { label: '> 85 %', color: '#ef4444' },
    ],
  },
  {
    key: 'water',
    label: 'Suv bosimi',
    unit: 'bar',
    icon: Droplets,
    color: '#22D3EE',
    glow: 'rgba(34,211,238,0.28)',
    bg: 'from-cyan-950/70 to-slate-950',
    border: 'border-cyan-500/25',
    gradientId: 'grad_water',
    nominal: 3,
    domain: [0, 6] as [number, number],
    dangerLow: 1,
    warnLow: 1.5,
    warnHigh: 4.5,
    dangerHigh: 5,
    decimals: 2,
    liveBase: 2.9,
    liveAmp: 0.4,
    getPoints: generateWaterPressure,
    legendRanges: [
      { label: '< 1 bar', color: '#ef4444' },
      { label: '1 – 1.5 bar', color: '#eab308' },
      { label: '1.5 – 4.5 bar', color: '#22c55e' },
      { label: '4.5 – 5 bar', color: '#eab308' },
      { label: '> 5 bar', color: '#ef4444' },
    ],
  },
]

// ── Xonadonlar iste'moli (mock) ────────────────────────────────────────────────

interface ApartmentUsage {
  id: number
  floor: number
  electricityKwh: number
  waterM3: number
  electricityRate: number
  waterRate: number
}

const APARTMENTS_PER_FLOOR = 4
const APARTMENT_COUNT = 24

function generateApartments(): ApartmentUsage[] {
  return Array.from({ length: APARTMENT_COUNT }, (_, i) => {
    const id = i + 1
    const floor = Math.floor(i / APARTMENTS_PER_FLOOR) + 1

    let electricityKwh = 60 + Math.abs(noise(i + 500)) * 160
    let waterM3 = 1.5 + Math.abs(noise(i + 700)) * 6.5

    if (id === 7) electricityKwh = 412
    if (id === 19) electricityKwh = 358
    if (id === 3) electricityKwh = 9
    if (id === 14) electricityKwh = 14
    if (id === 11) waterM3 = 15.8
    if (id === 22) waterM3 = 12.4
    if (id === 3) waterM3 = 0.4
    if (id === 9) waterM3 = 0.6

    return {
      id,
      floor,
      electricityKwh: +electricityKwh.toFixed(1),
      waterM3: +Math.max(0, waterM3).toFixed(2),
      electricityRate: +(0.03 + Math.abs(noise(i + 850)) * 0.12).toFixed(3),
      waterRate: +(0.002 + Math.abs(noise(i + 870)) * 0.006).toFixed(4),
    }
  })
}

// ── Kunlik / Haftalik iste'mol (bino bo'yicha, mock) ──────────────────────────

interface PeriodPoint {
  label: string
  electricityKwh: number
  waterM3: number
}

function generateDailyUsage(): PeriodPoint[] {
  const now = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (6 - i))
    const dow = d.getDay()
    const isWeekend = dow === 0 || dow === 6

    const baseElec = isWeekend ? 148 : 116
    const baseWater = isWeekend ? 13.4 : 10.2
    let elec = baseElec + noise(i + 900) * 12
    let water = baseWater + noise(i + 950) * 1.4

    if (i === 3) elec = 172
    if (i === 5) water = 16.8

    return {
      label: d.toLocaleDateString('uz-UZ', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      electricityKwh: +Math.max(0, elec).toFixed(1),
      waterM3: +Math.max(0, water).toFixed(2),
    }
  })
}

function generateWeeklyUsage(): PeriodPoint[] {
  const now = new Date()
  return Array.from({ length: 8 }, (_, i) => {
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - (7 - i) * 7 - now.getDay() + 1)

    let elec = 810 + noise(i + 1100) * 85
    let water = 76 + noise(i + 1150) * 8

    if (i === 5) elec = 1080
    if (i === 2) water = 48

    return {
      label: weekStart.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }),
      electricityKwh: +Math.max(0, elec).toFixed(0),
      waterM3: +Math.max(0, water).toFixed(1),
    }
  })
}

// ── Status helper ─────────────────────────────────────────────────────────────

type StatusLevel = 'normal' | 'warn' | 'danger'

function getStatus(
  value: number,
  cfg: { dangerLow: number; warnLow: number; warnHigh: number; dangerHigh: number },
): StatusLevel {
  if (value <= cfg.dangerLow || value >= cfg.dangerHigh) return 'danger'
  if (value <= cfg.warnLow || value >= cfg.warnHigh) return 'warn'
  return 'normal'
}

const STATUS_LABELS: Record<StatusLevel, string> = {
  normal: 'NORMAL',
  warn: 'EHTIYOT',
  danger: 'XATARLI',
}
const STATUS_COLORS: Record<StatusLevel, string> = {
  normal: '#22c55e',
  warn: '#eab308',
  danger: '#ef4444',
}
const STATUS_BG: Record<StatusLevel, string> = {
  normal: 'rgba(34,197,94,0.12)',
  warn: 'rgba(234,179,8,0.12)',
  danger: 'rgba(239,68,68,0.12)',
}

// ── Clock component ───────────────────────────────────────────────────────────

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="text-right leading-none">
      <div className="text-2xl lg:text-3xl font-mono font-black text-white tabular-nums tracking-tight">
        {now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="text-[11px] text-slate-400 mt-1">
        {now.toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </div>
  )
}

// ── Xonadonlar reytingi paneli ────────────────────────────────────────────────

interface RankItem {
  id: number
  floor: number
  value: number
}

function ApartmentRankPanel({
  title,
  icon: Icon,
  color,
  glow,
  unit,
  decimals,
  items,
}: {
  title: string
  icon: typeof Zap
  color: string
  glow: string
  unit: string
  decimals: number
  items: RankItem[]
}) {
  const max = Math.max(...items.map((it) => it.value), 1)
  const n = items.length

  return (
    <div className="flex-1 min-w-0 rounded-xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/50">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">{title}</span>
        <span className="text-[10px] text-slate-500 ml-auto">{n} ta xonadon</span>
      </div>

      <div className="max-h-[340px] overflow-y-auto px-3 py-2 space-y-1">
        {items.map((it, idx) => {
          const isTop = idx < 2
          const isBottom = idx >= n - 3
          const pct = Math.max(3, (it.value / max) * 100)
          return (
            <div
              key={it.id}
              className="flex items-center gap-2.5 py-1.5 px-1.5 rounded-lg"
              style={{
                backgroundColor: isTop
                  ? 'rgba(239,68,68,0.06)'
                  : isBottom
                    ? 'rgba(34,197,94,0.06)'
                    : 'transparent',
              }}
            >
              <span className="w-5 text-[11px] font-mono font-bold text-slate-500 text-right shrink-0">
                {idx + 1}
              </span>
              <span className="w-24 lg:w-28 text-[11px] text-slate-300 font-semibold truncate shrink-0">
                {it.id}-xonadon <span className="text-slate-500 font-normal">· {it.floor}-qavat</span>
              </span>
              <div className="flex-1 min-w-[40px] h-2 rounded-full bg-slate-800/70 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 8px ${glow}` }}
                />
              </div>
              <span
                className="w-16 text-right text-[11px] font-mono font-bold tabular-nums shrink-0"
                style={{ color }}
              >
                {it.value.toFixed(decimals)} {unit}
              </span>
              {isTop && <TrendingUp className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              {isBottom && <TrendingDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-800/50 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-red-400" /> Eng ko'p ishlatayotganlar
        </span>
        <span className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3 text-emerald-400" /> Eng kam ishlatayotganlar
        </span>
      </div>
    </div>
  )
}

// ── Kunlik/haftalik panel ──────────────────────────────────────────────────────

function PeriodUsagePanel({
  title,
  icon: Icon,
  color,
  glow,
  unit,
  decimals,
  dataKey,
  data,
}: {
  title: string
  icon: typeof Zap
  color: string
  glow: string
  unit: string
  decimals: number
  dataKey: 'electricityKwh' | 'waterM3'
  data: PeriodPoint[]
}) {
  const gradId = `grad_period_${dataKey}`
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/50">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">{title}</span>
      </div>
      <div className="h-52 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.9} />
                <stop offset="95%" stopColor={color} stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={45}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as PeriodPoint
                const value = p[dataKey]
                return (
                  <div className="bg-slate-900/95 border border-slate-700/80 rounded-lg p-2.5 shadow-xl backdrop-blur text-xs font-mono">
                    <div className="text-slate-400 font-sans mb-1">{p.label}</div>
                    <span className="font-extrabold text-sm" style={{ color }}>
                      {value.toFixed(decimals)} {unit}
                    </span>
                  </div>
                )
              }}
            />
            <Bar dataKey={dataKey} fill={`url(#${gradId})`} radius={[4, 4, 0, 0]} style={{ filter: `drop-shadow(0 0 6px ${glow})` }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DemoPage() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000)
    return () => clearInterval(id)
  }, [])

  const baseData = useMemo(
    () => CHARTS.map((cfg) => ({ key: cfg.key, points: cfg.getPoints() })),
    [],
  )

  const apartmentsBase = useMemo(() => generateApartments(), [])

  const apartmentsLive = useMemo(
    () =>
      apartmentsBase.map((a) => ({
        ...a,
        electricityKwh: +(a.electricityKwh + tick * a.electricityRate).toFixed(1),
        waterM3: +(a.waterM3 + tick * a.waterRate).toFixed(2),
      })),
    [apartmentsBase, tick],
  )

  const rankByElectricity: RankItem[] = useMemo(
    () =>
      [...apartmentsLive]
        .sort((a, b) => b.electricityKwh - a.electricityKwh)
        .map((a) => ({ id: a.id, floor: a.floor, value: a.electricityKwh })),
    [apartmentsLive],
  )

  const rankByWater: RankItem[] = useMemo(
    () =>
      [...apartmentsLive]
        .sort((a, b) => b.waterM3 - a.waterM3)
        .map((a) => ({ id: a.id, floor: a.floor, value: a.waterM3 })),
    [apartmentsLive],
  )

  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
  const dailyUsage = useMemo(() => generateDailyUsage(), [])
  const weeklyUsage = useMemo(() => generateWeeklyUsage(), [])
  const periodData = period === 'daily' ? dailyUsage : weeklyUsage

  const liveValues = useMemo(
    () =>
      CHARTS.map((cfg) => {
        const live = +(cfg.liveBase + Math.sin(tick * 0.8 + cfg.liveBase) * cfg.liveAmp).toFixed(cfg.decimals)
        return { key: cfg.key, live }
      }),
    [tick],
  )

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-950 text-white select-none">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-2.5 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-white">
                Turar-joy binosi №12
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 tracking-wider">
                DEMO
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Xorazm viloyati, Urganch shahri · Yagona 5-in-1 Kommunal Monitoring Ekran
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <span className="text-xs font-semibold text-emerald-400">JONLI</span>
          </div>
          <Clock />
        </div>
      </header>

      {/* ── Chart rows ── */}
      <div className="flex-1 flex flex-col overflow-y-auto min-h-0 divide-y divide-slate-800/40">
        {CHARTS.map((cfg) => {
          const Icon = cfg.icon
          const pts = baseData.find((d) => d.key === cfg.key)?.points ?? []
          const liveVal = liveValues.find((v) => v.key === cfg.key)?.live ?? cfg.liveBase

          const chartData: DataPoint[] = pts.map((p, i) =>
            i === pts.length - 1 ? { ...p, value: liveVal } : p,
          )

          const status = getStatus(liveVal, cfg)
          const gradId = cfg.gradientId

          return (
            <div
              key={cfg.key}
              className={`flex-1 flex min-h-[140px] bg-gradient-to-r ${cfg.bg} relative overflow-hidden`}
            >
              {/* Ambient glow */}
              <div
                className="absolute inset-0 pointer-events-none opacity-20 transition-opacity duration-1000"
                style={{
                  background: `radial-gradient(ellipse at 80% 50%, ${cfg.glow}, transparent 70%)`,
                }}
              />

              {/* ── Left stats panel ── */}
              <div className="w-64 lg:w-72 shrink-0 p-3.5 flex flex-col justify-between border-r border-slate-800/40 z-10 bg-slate-950/40 backdrop-blur-sm">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">
                        {cfg.label}
                      </span>
                    </div>

                    {/* Status badge */}
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-full tracking-wider shadow-sm transition-colors duration-500"
                      style={{
                        color: STATUS_COLORS[status],
                        backgroundColor: STATUS_BG[status],
                        border: `1px solid ${STATUS_COLORS[status]}40`,
                      }}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </div>

                  {/* Main live value */}
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span
                      className="text-2xl lg:text-3xl font-mono font-black tracking-tight tabular-nums transition-all duration-700"
                      style={{ color: cfg.color, textShadow: `0 0 16px ${cfg.glow}` }}
                    >
                      <AnimatedNumber value={liveVal} decimals={cfg.decimals} />
                    </span>
                    <span className="text-xs font-semibold text-slate-400">{cfg.unit}</span>
                  </div>

                  {cfg.key === 'soil' && (
                    <div className="mt-1">
                      <SoilStatusBadge value={liveVal} showScale={false} />
                    </div>
                  )}
                </div>

                {/* Legend / Range bar */}
                <div className="space-y-1 mt-2">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                    Me'yoriy zonalar:
                  </div>
                  <div className="flex gap-1">
                    {cfg.legendRanges.map((r, ri) => (
                      <div
                        key={ri}
                        className="flex-1 h-1.5 rounded-full transition-all duration-300"
                        style={{ backgroundColor: r.color, opacity: 0.8 }}
                        title={r.label}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                    <span>{cfg.domain[0]} {cfg.unit}</span>
                    <span>{cfg.domain[1]} {cfg.unit}</span>
                  </div>
                </div>
              </div>

              {/* ── Chart area ── */}
              <div className="flex-1 min-w-0 p-2 z-10 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={cfg.color} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={cfg.color} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

                    <XAxis
                      dataKey="label"
                      stroke="#475569"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: '#334155' }}
                    />
                    <YAxis
                      domain={cfg.domain}
                      stroke="#475569"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={45}
                    />

                    {/* Zone background overlays */}
                    <ReferenceArea
                      y1={cfg.domain[0]}
                      y2={cfg.dangerLow}
                      fill="#ef4444"
                      fillOpacity={0.06}
                    />
                    <ReferenceArea
                      y1={cfg.dangerLow}
                      y2={cfg.warnLow}
                      fill="#eab308"
                      fillOpacity={0.05}
                    />
                    <ReferenceArea
                      y1={cfg.warnLow}
                      y2={cfg.warnHigh}
                      fill="#22c55e"
                      fillOpacity={0.03}
                    />
                    <ReferenceArea
                      y1={cfg.warnHigh}
                      y2={cfg.dangerHigh}
                      fill="#eab308"
                      fillOpacity={0.05}
                    />
                    <ReferenceArea
                      y1={cfg.dangerHigh}
                      y2={cfg.domain[1]}
                      fill="#ef4444"
                      fillOpacity={0.06}
                    />

                    {/* Reference threshold lines */}
                    <ReferenceLine
                      y={cfg.dangerHigh}
                      stroke="#ef4444"
                      strokeDasharray="2 2"
                      strokeOpacity={0.6}
                    />
                    <ReferenceLine
                      y={cfg.warnHigh}
                      stroke="#eab308"
                      strokeDasharray="2 2"
                      strokeOpacity={0.5}
                    />
                    <ReferenceLine
                      y={cfg.warnLow}
                      stroke="#eab308"
                      strokeDasharray="2 2"
                      strokeOpacity={0.5}
                    />
                    <ReferenceLine
                      y={cfg.dangerLow}
                      stroke="#ef4444"
                      strokeDasharray="2 2"
                      strokeOpacity={0.6}
                    />

                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload as DataPoint
                        const st = getStatus(d.value, cfg)
                        return (
                          <div className="bg-slate-900/95 border border-slate-700/80 rounded-lg p-2.5 shadow-xl backdrop-blur text-xs font-mono">
                            <div className="text-slate-400 font-sans mb-1">{d.label}</div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm" style={{ color: cfg.color }}>
                                {d.value.toFixed(cfg.decimals)} {cfg.unit}
                              </span>
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                                style={{
                                  color: STATUS_COLORS[st],
                                  backgroundColor: STATUS_BG[st],
                                }}
                              >
                                {STATUS_LABELS[st]}
                              </span>
                            </div>
                          </div>
                        )
                      }}
                    />

                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={cfg.color}
                      strokeWidth={2.5}
                      fill={`url(#${gradId})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })}

        {/* ── Xonadonlar iste'moli reytingi ── */}
        <div className="p-4 lg:p-6 bg-gradient-to-br from-slate-900/60 to-slate-950">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-extrabold text-white tracking-tight uppercase">
              Xonadonlar bo'yicha iste'mol
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 tracking-wider">
              DEMO
            </span>
          </div>
          <div className="flex flex-col lg:flex-row gap-4">
            <ApartmentRankPanel
              title="Elektr iste'moli (bu oy)"
              icon={Zap}
              color="#FACC15"
              glow="rgba(250,204,21,0.35)"
              unit="kWh"
              decimals={1}
              items={rankByElectricity}
            />
            <ApartmentRankPanel
              title="Suv iste'moli (bu oy)"
              icon={Droplets}
              color="#22D3EE"
              glow="rgba(34,211,238,0.35)"
              unit="m³"
              decimals={2}
              items={rankByWater}
            />
          </div>
        </div>

        {/* ── Kunlik / haftalik iste'mol (bino bo'yicha) ── */}
        <div className="p-4 lg:p-6 bg-gradient-to-br from-slate-900/60 to-slate-950 border-t border-slate-800/40">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-white tracking-tight uppercase">
                Bino bo'yicha iste'mol dinamikasi
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 tracking-wider">
                DEMO
              </span>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800/60 border border-slate-700/50">
              {(['daily', 'weekly'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold tracking-wide transition-colors ${
                    period === p
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {p === 'daily' ? 'Kunlik (7 kun)' : 'Haftalik (8 hafta)'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col lg:flex-row gap-4">
            <PeriodUsagePanel
              title={`Elektr iste'moli — ${period === 'daily' ? 'kunlik' : 'haftalik'}`}
              icon={Zap}
              color="#FACC15"
              glow="rgba(250,204,21,0.35)"
              unit="kWh"
              decimals={1}
              dataKey="electricityKwh"
              data={periodData}
            />
            <PeriodUsagePanel
              title={`Suv iste'moli — ${period === 'daily' ? 'kunlik' : 'haftalik'}`}
              icon={Droplets}
              color="#22D3EE"
              glow="rgba(34,211,238,0.35)"
              unit="m³"
              decimals={1}
              dataKey="waterM3"
              data={periodData}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
