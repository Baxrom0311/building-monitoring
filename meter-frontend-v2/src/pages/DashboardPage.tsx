import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Clock,
  Droplets,
  Flame,
  Home,
  Sprout,
  TrendingUp,
  Volume2,
  Wifi,
  WifiOff,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useAlerts, useDevices, useHourlyStats, useSummary } from '@/hooks/queries'
import type { HourlyUtilityStat } from '@/types/api'
import { KPICard } from '@/components/KPICard'
import { MetricBarChart } from '@/components/charts/MetricBarChart'
import { ChartSkeleton, EmptyBlock, KPISkeletonGrid, TableSkeleton } from '@/components/StateBlock'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── Utility konfiguratsiyasi (seriya ranglari — chart palitrasi) ─────────────
type UtilityKey = 'electricity' | 'water' | 'gas' | 'soil' | 'sound'

const UTILITIES: { key: UtilityKey; label: string; icon: LucideIcon; color: string }[] = [
  { key: 'electricity', label: 'Elektr', icon: Zap, color: '#EAB308' },
  { key: 'water', label: 'Suv', icon: Droplets, color: '#06B6D4' },
  { key: 'gas', label: 'Gaz', icon: Flame, color: '#F97316' },
  { key: 'soil', label: "Yerto'la", icon: Sprout, color: '#22C55E' },
  { key: 'sound', label: 'Ovoz', icon: Volume2, color: '#A855F7' },
]

const UTILITY_LABELS: Record<string, string> = {
  electricity: 'Elektr',
  water: 'Suv',
  gas: 'Gaz',
  soil: "Yerto'la",
  sound: 'Ovoz',
}

// ── Soatlik statistikani utility bo'yicha alohida agregatsiya qilish ─────────
interface BucketRow {
  timestamp: number
  label: string
  samples: number
  power: number
  pressure: number
  pressureTop: number
  flow: number
  humidity: number
  level: number
}

function formatHourLabel(ts: number) {
  try {
    return new Date(ts * 1000).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(ts)
  }
}

function createEmptyRows(): BucketRow[] {
  const now = Math.floor(Date.now() / 1000)
  const currentHour = now - (now % 3600)
  return Array.from({ length: 24 }, (_, index) => {
    const ts = currentHour - (23 - index) * 3600
    return {
      timestamp: ts,
      label: formatHourLabel(ts),
      samples: 0,
      power: 0,
      pressure: 0,
      pressureTop: 0,
      flow: 0,
      humidity: 0,
      level: 0,
    }
  })
}

function aggregateRows(rows: HourlyUtilityStat[], utilityType: UtilityKey): BucketRow[] {
  const buckets = new Map<number, BucketRow>()

  rows
    .filter((row) => row.utility_type === utilityType)
    .forEach((row) => {
      const samples = Math.max(row.samples || 1, 1)
      const current = buckets.get(row.bucket_ts) ?? {
        timestamp: row.bucket_ts,
        label: formatHourLabel(row.bucket_ts),
        samples: 0,
        power: 0,
        pressure: 0,
        pressureTop: 0,
        flow: 0,
        humidity: 0,
        level: 0,
      }

      current.power += row.avg_power_w ?? 0
      current.pressure += (row.avg_pressure_bottom_bar ?? row.avg_pressure_bar ?? 0) * samples
      current.pressureTop += (row.avg_pressure_top_bar ?? 0) * samples
      current.flow += row.avg_flow_rate ?? 0
      current.humidity += (row.avg_humidity ?? 0) * samples
      current.level += (row.avg_level ?? 0) * samples
      current.samples += samples
      buckets.set(row.bucket_ts, current)
    })

  return Array.from(buckets.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((row) => ({
      ...row,
      power: Number(row.power.toFixed(1)),
      pressure: row.samples ? Number((row.pressure / row.samples).toFixed(3)) : 0,
      pressureTop: row.samples ? Number((row.pressureTop / row.samples).toFixed(3)) : 0,
      flow: Number(row.flow.toFixed(3)),
      humidity: row.samples ? Number((row.humidity / row.samples).toFixed(1)) : 0,
      level: row.samples ? Number((row.level / row.samples).toFixed(1)) : 0,
    }))
}

// ── Kommunal grafiklar paneli (oxirgi 24 soat) ───────────────────────────────
function UtilityChartsSection() {
  const { data, isLoading, isError } = useHourlyStats(24)
  const { data: devices } = useDevices(500)
  const emptyRows = useMemo(() => createEmptyRows(), [])

  const chartRows = useMemo(() => {
    const stats = data?.stats ?? []
    return {
      electricity: aggregateRows(stats, 'electricity'),
      water: aggregateRows(stats, 'water'),
      gas: aggregateRows(stats, 'gas'),
      soil: aggregateRows(stats, 'soil'),
      sound: aggregateRows(stats, 'sound'),
    }
  }, [data])

  // Tizimda haqiqatda mavjud qurilma turlari — grafiklar shunga qarab DINAMIK:
  // masalan tuproq namligi sensori ulanmagan bo'lsa, uning kartasi umuman chiqmaydi
  const presentTypes = useMemo(() => {
    const set = new Set<string>()
    for (const d of devices ?? []) set.add(d.utility_type)
    return set
  }, [devices])

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    )
  }

  const cards = [
    { ...UTILITIES[0], subtitle: "Barcha binolar quvvati yig'indisi", unit: 'W' },
    { ...UTILITIES[1], subtitle: "Bosim o'rtachasi va flow yig'indisi", unit: 'bar / flow' },
    { ...UTILITIES[2], subtitle: "Bosim o'rtachasi va flow yig'indisi", unit: 'bar / flow' },
    { ...UTILITIES[3], subtitle: 'Namlik foizi (oxirgi 24 soat)', unit: '%' },
    { ...UTILITIES[4], subtitle: 'Ovoz intensivligi (oxirgi 24 soat)', unit: '%' },
  ].filter(
    // Karta faqat shu turdagi qurilma RO'YXATGA OLINGAN bo'lsa ko'rinadi
    (card) => presentTypes.has(card.key),
  )

  if (cards.length === 0) {
    return (
      <EmptyBlock
        title="Hali qurilma ulanmagan"
        message="Qurilmalar ro'yxatga olingach, ularning turi bo'yicha grafiklar shu yerda paydo bo'ladi."
      />
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cards.map((card) => {
        const Icon = card.icon
        const rows = chartRows[card.key]
        const hasData = rows.length > 0
        const displayRows = hasData ? rows : emptyRows
        return (
          <Card key={card.key}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
                  <Icon className="h-4 w-4" style={{ color: card.color }} />
                </div>
                <div>
                  <CardTitle className="text-base">{card.label}</CardTitle>
                  <CardDescription>{card.subtitle}</CardDescription>
                </div>
              </div>
              <Badge variant="outline">{card.unit}</Badge>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {card.key === 'electricity' || card.key === 'soil' || card.key === 'sound' ? (
                  <MetricBarChart
                    data={displayRows}
                    xKey="label"
                    height={280}
                    maxBars={24}
                    unit={card.key === 'electricity' ? 'W' : '%'}
                    yDomain={card.key === 'electricity' ? undefined : [0, 100]}
                    series={[
                      {
                        key: card.key === 'electricity' ? 'power' : card.key === 'soil' ? 'humidity' : 'level',
                        name:
                          card.key === 'electricity'
                            ? 'Jami quvvat (W)'
                            : card.key === 'soil'
                              ? 'Namlik (%)'
                              : 'Ovoz darajasi (%)',
                        color: card.color,
                      },
                    ]}
                  />
                ) : (
                  <MetricBarChart
                    data={displayRows}
                    xKey="label"
                    height={280}
                    maxBars={24}
                    series={
                      card.key === 'water'
                        ? [
                            { key: 'pressure', name: 'Past bosim (bar)', color: card.color },
                            { key: 'pressureTop', name: 'Yuqori bosim (bar)', color: '#8B5CF6' },
                            { key: 'flow', name: 'Oqim (L/min)', color: '#10B981' },
                          ]
                        : [
                            { key: 'pressure', name: 'Bosim (bar)', color: card.color },
                            { key: 'flow', name: 'Oqim (m³/h)', color: '#10B981' },
                          ]
                    }
                  />
                )}
                {(!hasData || isError) && (
                  <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                    <Badge variant="secondary">
                      {isError ? 'Statistika olinmadi' : "O'lchov kelganda grafik to'ladi"}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Sahifa ───────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: summary, isLoading: summaryLoading } = useSummary()
  const { data: devices, isLoading: devicesLoading } = useDevices()
  const { data: alerts } = useAlerts(false, 5)

  const assignedDevices = useMemo(
    () => (devices ?? []).filter((d) => d.building_id !== null).slice(0, 10),
    [devices],
  )

  const utilityStats = useMemo(() => {
    return UTILITIES.map((u) => {
      const rows = (devices ?? []).filter((d) => d.utility_type === u.key)
      return {
        ...u,
        total: rows.length,
        online: rows.filter((d) => d.online).length,
        offline: rows.filter((d) => !d.online).length,
      }
    })
  }, [devices])

  const onlinePercent = summary?.devices_total
    ? Math.round(((summary.devices_online || 0) / summary.devices_total) * 100)
    : 0

  const criticalAlerts = (alerts ?? []).filter((a) => a.severity === 'critical').length

  return (
    <div className="space-y-6">
      {/* Sahifa kirish qatori */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Boshqaruv paneli</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('uz-UZ', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            {onlinePercent}% online
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Bell className="h-3.5 w-3.5 text-red-500" />
            {summary?.alerts_active || 0} alert
          </Badge>
        </div>
      </div>

      {/* KPI kartalar */}
      {summaryLoading ? (
        <KPISkeletonGrid />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Jami qurilmalar"
            value={summary?.devices_total || 0}
            subtitle={`${summary?.devices_online || 0} online`}
            icon={Zap}
          />
          <KPICard
            title="Jami binolar"
            value={summary?.buildings || 0}
            subtitle="Ro'yxatdagi binolar"
            icon={Home}
            tone="success"
          />
          <KPICard
            title="Faol ogohlantirishlar"
            value={summary?.alerts_active || 0}
            subtitle={`${criticalAlerts} kritik`}
            icon={AlertCircle}
            tone={summary?.alerts_active ? 'destructive' : 'default'}
          />
          <KPICard
            title="O'lchovlar (soatlik)"
            value={summary?.reads_last_hour || 0}
            subtitle="So'ngi soat"
            icon={TrendingUp}
            tone="warning"
          />
        </div>
      )}

      {/* Kommunal qurilmalar bo'yicha statistika */}
      {!devicesLoading && (devices ?? []).length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Kommunal qurilmalar</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/devices')}>
              Barchasini ko'rish
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {utilityStats.map((u) => {
              const Icon = u.icon
              const pct = u.total ? Math.round((u.online / u.total) * 100) : 0
              return (
                <Card
                  key={u.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/devices?utility=${u.key}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/devices?utility=${u.key}`)
                  }}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                >
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card">
                        <Icon className="h-4 w-4" style={{ color: u.color }} />
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">{pct}%</span>
                    </div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{u.label}</p>
                    <p className="mt-1 font-mono text-2xl font-semibold">{u.total}</p>
                    <Progress value={pct} className="mt-2.5 h-1.5" />
                    <div className="mt-2 flex items-center justify-between text-xs font-medium">
                      <span className="flex items-center gap-1 text-emerald-500">
                        <Wifi className="h-3 w-3" />
                        {u.online}
                      </span>
                      <span className="flex items-center gap-1 text-red-500">
                        <WifiOff className="h-3 w-3" />
                        {u.offline}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Kommunal monitoring grafiklari */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Kommunal monitoring grafiklari</h2>
          <p className="text-sm text-muted-foreground">
            Barcha binolar bo'yicha elektr, suv, gaz, namlik va ovoz — oxirgi 24 soat
          </p>
        </div>
        <UtilityChartsSection />
      </div>

      {/* Qurilmalar jadvali + Ogohlantirishlar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Qurilmalar</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/devices')}>
              Hammasi
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {devicesLoading ? (
              <TableSkeleton rows={5} />
            ) : assignedDevices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Qurilma</TableHead>
                    <TableHead>Tur</TableHead>
                    <TableHead>Ko'rilgan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedDevices.map((device) => (
                    <TableRow
                      key={device.id}
                      onClick={() => navigate(`/devices/${device.id}`)}
                      className="cursor-pointer"
                    >
                      <TableCell>
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${device.online ? 'bg-emerald-500' : 'bg-red-500'}`}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[160px] truncate font-medium">{device.name ?? device.id}</p>
                        {device.name && (
                          <p className="max-w-[160px] truncate font-mono text-xs text-muted-foreground">
                            {device.id}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {UTILITY_LABELS[device.utility_type] || device.utility_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          {device.last_seen
                            ? formatDistanceToNow(new Date(device.last_seen * 1000), { addSuffix: false })
                            : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Home className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p>Binoga biriktirilgan qurilmalar yo'q</p>
                <Button variant="link" size="sm" className="mt-2" onClick={() => navigate('/devices')}>
                  Qurilmalar sahifasiga o'tish
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Faol ogohlantirishlar
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/alerts')}>
              Hammasi
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[480px] space-y-2.5 overflow-y-auto">
              {alerts && alerts.length > 0 ? (
                alerts.map((alert) => (
                  <div key={alert.id} className="rounded-lg border border-border p-3.5">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          alert.severity === 'critical'
                            ? 'text-red-500'
                            : alert.severity === 'warning'
                              ? 'text-amber-500'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {alert.kind}
                      </span>
                      <Badge
                        variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}
                        className="shrink-0 uppercase"
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-sm leading-snug">{alert.message}</p>
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(alert.ts * 1000), { addSuffix: true })}
                    </p>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Bell className="mb-2 h-8 w-8 opacity-30" />
                  <p className="text-sm">Ma'lumot yo'q</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
