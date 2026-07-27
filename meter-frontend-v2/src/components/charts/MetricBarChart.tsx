import { useId } from 'react'
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

/**
 * MetricBarChart — loyihaning yagona, sayqallangan ustunli grafigi.
 *
 * Dizayn qoidalari:
 *  - Har seriya uchun vertikal gradient (to'liq rang → 45% shaffof) + yumaloq tepa
 *  - Ustunlar soni cheklanadi (maxBars) — zich ma'lumot o'qib bo'lmas holga kelmasin
 *  - Grid faqat gorizontal, xira; o'qlar chiziqsiz
 *  - Legend faqat 2+ seriyada, rang nuqtali ixcham qator
 */

export interface MetricSeries {
  key: string
  name: string
  color: string
}

interface MetricBarChartProps {
  data: object[]
  xKey: string
  series: MetricSeries[]
  height?: number
  /** Oxirgi N ta nuqtani ko'rsatish (zichlikni cheklash). 0 = hammasi */
  maxBars?: number
  /** Gorizontal etalon chiziq (masalan 220V) */
  nominal?: { value: number; label?: string; color?: string }
  /** Y o'qi birligi (tooltipda ko'rsatiladi) */
  unit?: string
  yDomain?: [number, number]
  /** Kiosk (qorong'i) rejim uchun maxsus fon ranglari */
  dark?: boolean
}

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 }
const AXIS_TICK_DARK = { fill: '#64748b', fontSize: 11 }

export function MetricBarChart({
  data,
  xKey,
  series,
  height = 300,
  maxBars = 36,
  nominal,
  unit,
  yDomain,
  dark = false,
}: MetricBarChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const rows = maxBars > 0 && data.length > maxBars ? data.slice(-maxBars) : data

  const tooltipStyle = dark
    ? {
        background: '#0f172a',
        color: '#f1f5f9',
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 10,
        fontSize: 12.5,
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
      }
    : {
        background: 'var(--popover)',
        color: 'var(--popover-foreground)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        fontSize: 12.5,
        boxShadow: '0 12px 32px rgb(0 0 0 / 0.12)',
      }

  // Ko'p seriyada ustunlar ingichkalashadi — kenglikni moslash
  const barSize = series.length >= 3 ? 10 : series.length === 2 ? 16 : 30

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} barCategoryGap="28%" barGap={3} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${uid}_${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.95} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.45} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 6"
            stroke={dark ? 'rgba(148,163,184,0.10)' : 'var(--border)'}
            strokeOpacity={dark ? 1 : 0.6}
            vertical={false}
          />
          <XAxis
            dataKey={xKey}
            tick={dark ? AXIS_TICK_DARK : AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={dark ? AXIS_TICK_DARK : AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={yDomain}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
            cursor={{ fill: dark ? 'rgba(148,163,184,0.08)' : 'var(--muted)', opacity: dark ? 1 : 0.4, radius: 6 }}
            formatter={(value, name) => [
              `${typeof value === 'number' ? value.toLocaleString('uz-UZ') : String(value)}${unit ? ` ${unit}` : ''}`,
              String(name),
            ]}
          />
          {nominal && (
            <ReferenceLine
              y={nominal.value}
              stroke={nominal.color ?? 'var(--muted-foreground)'}
              strokeDasharray="6 4"
              strokeOpacity={0.5}
              label={
                nominal.label
                  ? { value: nominal.label, fill: nominal.color ?? 'var(--muted-foreground)', fontSize: 10, position: 'right', opacity: 0.7 }
                  : undefined
              }
            />
          )}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={`url(#${uid}_${s.key})`}
              radius={[5, 5, 0, 0]}
              maxBarSize={barSize}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
