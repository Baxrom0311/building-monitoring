import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clock,
  Droplets,
  Flame,
  Gauge,
  Pencil,
  RefreshCw,
  Sprout,
  Thermometer,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Volume2,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useBuildings, useDeviceById, useDeviceHistory, useDeviceLatest, qk } from '@/hooks/queries'
import { MetricBarChart } from '@/components/charts/MetricBarChart'
import { useAuth } from '@/contexts/AuthContext'
import apiClient from '@/lib/api'
import { getApiErrorMessage } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/toast'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/StateBlock'
import { KPICard } from '@/components/KPICard'
import { Pagination } from '@/components/Pagination'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type PendingCommand =
  | { type: 'reboot' }
  | { type: 'status' }
  | { type: 'delete' }

const UTILITY_LABELS: Record<string, string> = {
  electricity: 'Elektr',
  water: 'Suv',
  gas: 'Gaz',
  soil: "Yerto'la namligi",
  sound: 'Ovoz',
}

const UTILITY_ICONS: Record<string, LucideIcon> = {
  electricity: Zap,
  water: Droplets,
  gas: Flame,
  soil: Sprout,
  sound: Volume2,
}

interface KpiItem {
  key: string
  title: string
  value: string
  icon?: LucideIcon
  tone?: 'default' | 'success' | 'warning' | 'destructive'
}

function InfoField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={mono ? 'break-all font-mono text-sm' : 'text-sm font-medium'}>{value}</p>
    </div>
  )
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(10)

  const {
    data: device,
    isLoading,
    isError,
    error: deviceQueryError,
    refetch,
  } = useDeviceById(id || '')
  const { data: latestReading } = useDeviceLatest(id || '')
  const { data: chartHistoryData } = useDeviceHistory(id || '', 24, 1, 100)
  const { data: historyData } = useDeviceHistory(id || '', 24, historyPage, historyPageSize)
  const { data: buildings } = useBuildings()

  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null)

  // ── Tahrirlash formasi ────────────────────────────────────────────────────
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editUtilityType, setEditUtilityType] = useState('electricity')
  const [editBuildingId, setEditBuildingId] = useState('none')
  const [editFloor, setEditFloor] = useState('')
  const [editRoom, setEditRoom] = useState('')
  const [editGroupName, setEditGroupName] = useState('')
  const [editDeviceRole, setEditDeviceRole] = useState('none')
  const [editFirmwareMode, setEditFirmwareMode] = useState('none')
  const [editIsTestDevice, setEditIsTestDevice] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const handleReboot = async () => {
    setLoadingAction('reboot')
    try {
      await apiClient.post(`/api/devices/${id}/reboot`)
      notifySuccess("Reboot buyrug'i yuborildi")
    } catch (err) {
      notifyError('Buyruq yuborilmadi', getApiErrorMessage(err))
    } finally {
      setLoadingAction(null)
    }
  }

  const handleToggleStatus = async () => {
    if (!device || !id) return
    const deviceId = id
    setLoadingAction('status')
    try {
      const nextStatus = !device.is_active
      await apiClient.put(`/api/devices/${deviceId}`, {
        is_active: nextStatus,
        name: device.name || null,
        utility_type: device.utility_type,
      })
      queryClient.invalidateQueries({ queryKey: qk.deviceDetail(deviceId) })
      queryClient.invalidateQueries({ queryKey: qk.devices() })
      queryClient.invalidateQueries({ queryKey: qk.summary() })
      notifySuccess(`Qurilma statusi ${nextStatus ? 'faollashtirildi' : 'faolsizlantirildi'}`)
    } catch (err) {
      notifyError('Status o\'zgartirilmadi', getApiErrorMessage(err))
    } finally {
      setLoadingAction(null)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    setLoadingAction('delete')
    try {
      await apiClient.delete(`/api/devices/${id}`)
      queryClient.invalidateQueries({ queryKey: qk.devices() })
      queryClient.invalidateQueries({ queryKey: qk.summary() })
      notifySuccess("Qurilma o'chirildi")
      navigate(-1)
    } catch (err) {
      notifyError("Qurilma o'chirilmadi", getApiErrorMessage(err))
    } finally {
      setLoadingAction(null)
    }
  }

  const openEdit = () => {
    if (!device) return
    setEditName(device.name ?? '')
    setEditUtilityType(device.utility_type)
    setEditBuildingId(device.building_id ? String(device.building_id) : 'none')
    setEditFloor(device.floor ?? '')
    setEditRoom(device.room ?? '')
    setEditGroupName(device.group_name ?? '')
    setEditDeviceRole(device.device_role || 'none')
    setEditFirmwareMode(device.firmware_mode || 'none')
    setEditIsTestDevice(device.is_test_device ?? false)
    setIsEditOpen(true)
  }

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!device || !id) return
    const deviceId = id
    setEditSubmitting(true)
    try {
      await apiClient.put(`/api/devices/${deviceId}`, {
        name: editName.trim() || null,
        utility_type: editUtilityType,
        is_active: device.is_active,
        building_id: editBuildingId !== 'none' ? parseInt(editBuildingId) : null,
        floor: editFloor.trim() || null,
        room: editRoom.trim() || null,
        group_name: editGroupName.trim() || null,
        device_role: editDeviceRole !== 'none' ? editDeviceRole : null,
        firmware_mode: editFirmwareMode !== 'none' ? editFirmwareMode : null,
        is_test_device: editIsTestDevice,
      })
      queryClient.invalidateQueries({ queryKey: qk.deviceDetail(deviceId) })
      queryClient.invalidateQueries({ queryKey: qk.devices() })
      queryClient.invalidateQueries({ queryKey: qk.summary() })
      setIsEditOpen(false)
      notifySuccess('Qurilma yangilandi')
    } catch (err) {
      notifyError('Saqlanmadi', getApiErrorMessage(err))
    } finally {
      setEditSubmitting(false)
    }
  }

  const executePendingCommand = () => {
    if (!pendingCommand) return
    if (pendingCommand.type === 'reboot') {
      handleReboot()
    } else if (pendingCommand.type === 'delete') {
      handleDelete()
    } else {
      handleToggleStatus()
    }
    setPendingCommand(null)
  }

  // Grafik ma'lumotlari: o'lchovlarni SOATLIK yiriklashtirish — har 30s lik
  // xom o'qishlar bilan ustunlar juda zich va o'qib bo'lmas edi
  const chartData = useMemo(() => {
    if (!chartHistoryData?.readings) return []
    interface Acc {
      ts: number
      n: number
      power: number
      voltage: number
      pressure: number
      pressureTop: number
      flow: number
      volume: number
      humidity: number
      level: number
      tempIn: number
      tempOut: number
    }
    const buckets = new Map<number, Acc>()
    for (const r of chartHistoryData.readings) {
      const hour = r.ts - (r.ts % 3600)
      const acc = buckets.get(hour) ?? {
        ts: hour, n: 0, power: 0, voltage: 0, pressure: 0,
        pressureTop: 0, flow: 0, volume: 0, humidity: 0, level: 0,
        tempIn: 0, tempOut: 0,
      }
      acc.n += 1
      acc.power += r.power_w ?? 0
      acc.voltage += r.voltage_l1 ?? 0
      acc.pressure += r.pressure_bar ?? r.pressure_bottom_bar ?? 0
      acc.pressureTop += r.pressure_top_bar ?? 0
      acc.flow += r.flow_rate ?? 0
      acc.volume = Math.max(acc.volume, r.volume_m3 ?? 0)
      acc.humidity += r.humidity ?? 0
      acc.level += r.level ?? 0
      acc.tempIn += r.temperature_in_c ?? 0
      acc.tempOut += r.temperature_out_c ?? 0
      buckets.set(hour, acc)
    }
    return Array.from(buckets.values())
      .sort((a, b) => a.ts - b.ts)
      .map((b) => ({
        timestamp: new Date(b.ts * 1000).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
        power: Number((b.power / b.n).toFixed(1)),
        voltage: Number((b.voltage / b.n).toFixed(1)),
        pressure: Number((b.pressure / b.n).toFixed(3)),
        pressureTop: Number((b.pressureTop / b.n).toFixed(3)),
        flow: Number((b.flow / b.n).toFixed(2)),
        volume: b.volume,
        humidity: Number((b.humidity / b.n).toFixed(1)),
        level: Number((b.level / b.n).toFixed(1)),
        tempIn: Number((b.tempIn / b.n).toFixed(1)),
        tempOut: Number((b.tempOut / b.n).toFixed(1)),
      }))
  }, [chartHistoryData])

  const chartMeta =
    device?.utility_type === 'water'
      ? { title: "Suv ko'rsatkichlari grafigi", subtitle: "Oxirgi 24 soatdagi bosim va oqim o'zgarishi" }
      : device?.utility_type === 'gas'
        ? { title: "Gaz ko'rsatkichlari grafigi", subtitle: "Oxirgi 24 soatdagi bosim va oqim o'zgarishi" }
        : device?.utility_type === 'soil'
          ? { title: "Yerto'la namligi grafigi", subtitle: "Oxirgi 24 soatdagi namlik o'zgarishi" }
          : device?.utility_type === 'sound'
            ? { title: 'Ovoz darajasi grafigi', subtitle: "Oxirgi 24 soatdagi ovoz darajasi o'zgarishi" }
            : device?.utility_type === 'heating'
              ? { title: 'Qozonxona harorati grafigi', subtitle: "Oxirgi 24 soatdagi kirish/chiqish harorati" }
              : { title: 'Elektr quvvati grafigi', subtitle: "Oxirgi 24 soatdagi Power W o'zgarishi" }

  // So'nggi ko'rsatkich KPI kartalari
  const kpis = useMemo<KpiItem[]>(() => {
    if (!latestReading) return []
    const r = latestReading
    const items: KpiItem[] = []
    if (r.voltage_l1 !== null && r.voltage_l1 !== undefined)
      items.push({ key: 'voltage_l1', title: 'Kuchlanish L1', value: `${r.voltage_l1} V`, icon: Zap })
    if (r.current_l1 !== null && r.current_l1 !== undefined)
      items.push({ key: 'current_l1', title: 'Tok kuchi L1', value: `${r.current_l1} A`, icon: Activity })
    if (r.power_w !== null && r.power_w !== undefined)
      items.push({ key: 'power_w', title: 'Faol quvvat', value: `${r.power_w} W`, icon: Zap, tone: 'success' })
    if (r.energy_kwh !== null && r.energy_kwh !== undefined)
      items.push({ key: 'energy_kwh', title: 'Jami energiya', value: `${r.energy_kwh} kWh`, icon: Gauge })
    if (r.frequency !== null && r.frequency !== undefined)
      items.push({ key: 'frequency', title: 'Chastota', value: `${r.frequency} Hz`, icon: Activity })
    if (r.pf !== null && r.pf !== undefined)
      items.push({ key: 'pf', title: 'Power Factor', value: `${r.pf}`, icon: Gauge })
    if (r.pressure_bottom_bar !== null && r.pressure_bottom_bar !== undefined)
      items.push({ key: 'pressure_bottom_bar', title: 'Past bosim', value: `${r.pressure_bottom_bar} bar`, icon: Gauge })
    if (r.pressure_top_bar !== null && r.pressure_top_bar !== undefined)
      items.push({ key: 'pressure_top_bar', title: 'Yuqori bosim', value: `${r.pressure_top_bar} bar`, icon: Gauge })
    if (r.pressure_bar !== null && r.pressure_bar !== undefined)
      items.push({ key: 'pressure_bar', title: 'Bosim', value: `${r.pressure_bar} bar`, icon: Gauge, tone: 'warning' })
    if (r.flow_rate !== null && r.flow_rate !== undefined)
      items.push({ key: 'flow_rate', title: 'Oqim', value: `${r.flow_rate}`, icon: Droplets })
    if (r.volume_m3 !== null && r.volume_m3 !== undefined)
      items.push({ key: 'volume_m3', title: 'Hajm', value: `${r.volume_m3} m³`, icon: Droplets, tone: 'success' })
    if (r.temperature_in_c !== null && r.temperature_in_c !== undefined)
      items.push({ key: 'temperature_in_c', title: 'Kirish harorati', value: `${r.temperature_in_c} °C`, icon: Thermometer, tone: 'warning' })
    if (r.temperature_out_c !== null && r.temperature_out_c !== undefined)
      items.push({ key: 'temperature_out_c', title: 'Chiqish harorati', value: `${r.temperature_out_c} °C`, icon: Thermometer, tone: 'success' })
    if (r.temperature_c !== null && r.temperature_c !== undefined)
      items.push({ key: 'temperature_c', title: 'Harorat', value: `${r.temperature_c} °C`, icon: Thermometer })
    if (r.humidity !== null && r.humidity !== undefined)
      items.push({ key: 'humidity', title: 'Namlik', value: `${r.humidity.toFixed(1)} %`, icon: Sprout, tone: 'success' })
    if (r.level !== null && r.level !== undefined)
      items.push({ key: 'level', title: 'Ovoz darajasi', value: `${r.level.toFixed(1)} %`, icon: Volume2 })
    return items
  }, [latestReading])

  if (!id) return <ErrorBlock title="Xatolik" message="Qurilma IDsi topilmadi" />

  const UtilityIcon = device ? (UTILITY_ICONS[device.utility_type] ?? Zap) : Zap

  return (
    <div className="space-y-6">
      {/* ── Orqaga ── */}
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" />
        Orqaga
      </Button>

      {isLoading ? (
        <LoadingBlock title="Qurilma yuklanmoqda..." message="Qurilma holati va so'nggi telemetriya olinmoqda." />
      ) : isError ? (
        <ErrorBlock
          title="Qurilma maʼlumotlari olinmadi"
          message={getApiErrorMessage(deviceQueryError)}
          onRetry={() => refetch()}
        />
      ) : device ? (
        <div className="space-y-6">
          {/* ── Sarlavha qatori ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{device.name ?? device.id}</h1>
              {device.online ? (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                  Online
                </Badge>
              ) : (
                <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-500">
                  Offline
                </Badge>
              )}
              <Badge variant="secondary">{UTILITY_LABELS[device.utility_type] ?? device.utility_type}</Badge>
              {device.is_test_device && <Badge variant="outline">Test</Badge>}
              {device.needs_rebind && (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                  Rebind
                </Badge>
              )}
            </div>
            {isAdmin && (
              <Button onClick={openEdit} disabled={loadingAction !== null}>
                <Pencil className="h-4 w-4" />
                Tahrirlash
              </Button>
            )}
          </div>

          {/* ── Rebind ogohlantirishi ── */}
          {device.needs_rebind && (
            <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-5 md:flex-row md:items-center">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Qayta biriktirish talab etiladi</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Qurilmaga yangi hisoblagich (serial:{' '}
                  <span className="font-mono font-semibold text-amber-500">{device.meter_serial}</span>) ulanganligi
                  sababli, uning avvalgi bino va o'lchov nuqtasi bog'lanishi bekor qilingan. Qurilmani yangi bino va
                  nuqtaga qayta biriktiring.
                </p>
              </div>
              {isAdmin && (
                <Button variant="outline" className="shrink-0" onClick={openEdit}>
                  Hozir biriktirish
                </Button>
              )}
            </div>
          )}

          {/* ── Asosiy ma'lumot + boshqaruv ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Qurilma ma'lumotlari</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-5 md:grid-cols-3">
                  <InfoField label="Tur" value={UTILITY_LABELS[device.utility_type] ?? device.utility_type} />
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Holat</p>
                    <p className={`text-sm font-semibold ${device.online ? 'text-emerald-500' : 'text-red-500'}`}>
                      {device.online ? 'Online' : 'Offline'}
                    </p>
                  </div>
                  <InfoField
                    label="Oxirgi ko'rilgan"
                    value={device.last_seen ? new Date(device.last_seen * 1000).toLocaleString('uz-UZ') : '—'}
                  />
                  <InfoField
                    label="Bino"
                    value={
                      device.building_id
                        ? (buildings?.find((b) => b.id === device.building_id)?.name ??
                           `#${device.building_id}`)
                        : (device.building ?? '—')
                    }
                  />
                  <InfoField
                    label="Qavat / Xona"
                    value={
                      device.floor || device.room
                        ? `${device.floor ?? ''}${device.floor && device.room ? ' / ' : ''}${device.room ?? ''}`
                        : '—'
                    }
                  />
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Tizim faolligi</p>
                    <div className="flex flex-wrap gap-1.5">
                      {device.is_active ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                          Faol
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-500">
                          Faol emas
                        </Badge>
                      )}
                      {device.is_test_device && <Badge variant="secondary">Test</Badge>}
                      {device.needs_rebind && (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                          Rebind
                        </Badge>
                      )}
                    </div>
                  </div>
                  {device.meter_serial && <InfoField label="Hisoblagich seriali" value={device.meter_serial} mono />}
                  {device.group_name && <InfoField label="Guruh" value={device.group_name} />}
                </div>

                <Separator />

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Texnik ma'lumotlar
                  </p>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <InfoField label="Device ID" value={device.id} mono />
                    <InfoField label="Firmware rejimi" value={device.firmware_mode || '—'} mono />
                    <InfoField label="Qurilma roli" value={device.device_role || '—'} mono />
                    <InfoField label="FW versiya" value={device.fw_version || '—'} mono />
                    {device.chip_model && <InfoField label="Chip" value={device.chip_model} mono />}
                    {device.baud_rate !== null && device.baud_rate !== undefined && (
                      <InfoField label="Baud rate" value={String(device.baud_rate)} mono />
                    )}
                    {device.rssi !== null && device.rssi !== undefined && (
                      <InfoField label="RSSI" value={`${device.rssi} dBm`} mono />
                    )}
                    {device.serial_number && <InfoField label="Serial" value={device.serial_number} mono />}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Boshqaruv paneli ── */}
            <Card>
              <CardHeader>
                <CardTitle>Boshqaruv paneli</CardTitle>
              </CardHeader>
              <CardContent>
                {isAdmin ? (
                  <div className="flex flex-col gap-3">
                    <Button
                      variant="outline"
                      disabled={loadingAction !== null}
                      onClick={() => setPendingCommand({ type: 'reboot' })}
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingAction === 'reboot' ? 'animate-spin' : ''}`} />
                      Qurilmani reboot qilish
                    </Button>

                    <Button
                      variant="outline"
                      disabled={loadingAction !== null}
                      onClick={() => setPendingCommand({ type: 'status' })}
                    >
                      {device.is_active ? (
                        <>
                          <ToggleLeft className="h-4 w-4 text-red-500" />
                          Faolsizlantirish
                        </>
                      ) : (
                        <>
                          <ToggleRight className="h-4 w-4 text-emerald-500" />
                          Faollashtirish
                        </>
                      )}
                    </Button>

                    <Button
                      variant="destructive"
                      disabled={loadingAction !== null}
                      onClick={() => setPendingCommand({ type: 'delete' })}
                    >
                      <Trash2 className="h-4 w-4" />
                      Qurilmani o'chirish
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    Boshqaruv amallari faqat administratorlar uchun ruxsat etilgan.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Real-vaqtdagi ko'rsatkichlar ── */}
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UtilityIcon className="h-4 w-4 text-muted-foreground" />
              Real-vaqtdagi ko'rsatkichlar
            </h2>
            {kpis.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {kpis.map((kpi) => (
                  <KPICard key={kpi.key} title={kpi.title} value={kpi.value} icon={kpi.icon} tone={kpi.tone} />
                ))}
              </div>
            ) : (
              <EmptyBlock
                title="Ko'rsatkich kelmagan"
                message="Qurilmadan hali hech qanday ko'rsatkich kelib tushmagan."
              />
            )}
          </div>

          {/* ── Tarixiy grafik ── */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {chartMeta.title}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{chartMeta.subtitle}</p>
                </div>
                <Badge variant="outline">24 soat</Badge>
              </CardHeader>
              <CardContent>
                <MetricBarChart
                      data={chartData}
                      xKey="timestamp"
                      height={256}
                      maxBars={24}
                      series={
                        device.utility_type === 'electricity'
                          ? [
                              { key: 'power', name: 'Power (W)', color: '#EAB308' },
                              { key: 'voltage', name: 'Voltage (V)', color: '#3B82F6' },
                            ]
                          : device.utility_type === 'water'
                            ? [
                                { key: 'pressure', name: 'Pastki bosim (bar)', color: '#06B6D4' },
                                { key: 'pressureTop', name: 'Yuqori bosim (bar)', color: '#8B5CF6' },
                                ...(chartData.some((d) => d.flow > 0)
                                  ? [{ key: 'flow', name: 'Suv oqimi (L/min)', color: '#10B981' }]
                                  : []),
                              ]
                            : device.utility_type === 'gas'
                              ? [
                                  { key: 'pressure', name: 'Bosim (bar)', color: '#F97316' },
                                  ...(chartData.some((d) => d.flow > 0)
                                    ? [{ key: 'flow', name: 'Gaz oqimi (m³/h)', color: '#10B981' }]
                                    : []),
                                ]
                              : device.utility_type === 'soil'
                                ? [{ key: 'humidity', name: 'Namlik (%)', color: '#22C55E' }]
                                : device.utility_type === 'heating'
                                  ? [
                                      { key: 'tempIn', name: 'Kirish (°C)', color: '#F97316' },
                                      { key: 'tempOut', name: 'Chiqish (°C)', color: '#06B6D4' },
                                    ]
                                  : device.utility_type === 'sound'
                                    ? [{ key: 'level', name: 'Ovoz darajasi (%)', color: '#A855F7' }]
                                    : [{ key: 'power', name: 'Power (W)', color: '#EAB308' }]
                      }
                />
              </CardContent>
            </Card>
          )}

          {/* ── O'lchovlar jurnali ── */}
          {historyData?.readings && historyData.readings.length > 0 && (
            <Card className="overflow-hidden py-0">
              <div className="flex items-center justify-between gap-4 border-b border-border p-4">
                <h3 className="font-semibold">O'lchovlar jurnali</h3>
                <span className="text-xs text-muted-foreground">Oxirgi 24 soat</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vaqt</TableHead>
                      {device.utility_type === 'electricity' ? (
                        <>
                          <TableHead>Kuchlanish (V)</TableHead>
                          <TableHead>Tok kuchi (A)</TableHead>
                          <TableHead>Quvvat (W)</TableHead>
                          <TableHead>Energiya (kWh)</TableHead>
                        </>
                      ) : device.utility_type === 'water' ? (
                        <>
                          <TableHead>Pastki bosim (bar)</TableHead>
                          <TableHead>Yuqori bosim (bar)</TableHead>
                          <TableHead>Oqim (L/min)</TableHead>
                          <TableHead>Jami hajm (m³)</TableHead>
                        </>
                      ) : device.utility_type === 'soil' ? (
                        <TableHead>Namlik (%)</TableHead>
                      ) : device.utility_type === 'sound' ? (
                        <TableHead>Ovoz darajasi (%)</TableHead>
                      ) : device.utility_type === 'heating' ? (
                        <>
                          <TableHead>Kirish (°C)</TableHead>
                          <TableHead>Chiqish (°C)</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead>Bosim (bar)</TableHead>
                          <TableHead>Oqim (m³/h)</TableHead>
                          <TableHead>Jami hajm (m³)</TableHead>
                          <TableHead>Harorat (°C)</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyData.readings.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {new Date(r.ts * 1000).toLocaleString('uz-UZ')}
                        </TableCell>
                        {device.utility_type === 'electricity' ? (
                          <>
                            <TableCell className="font-mono">{r.voltage_l1 ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.current_l1 ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.power_w ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.energy_kwh ?? '—'}</TableCell>
                          </>
                        ) : device.utility_type === 'water' ? (
                          <>
                            <TableCell className="font-mono">{r.pressure_bottom_bar ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.pressure_top_bar ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.flow_rate ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.volume_m3 ?? '—'}</TableCell>
                          </>
                        ) : device.utility_type === 'soil' ? (
                          <TableCell className="font-mono">
                            {r.humidity !== null && r.humidity !== undefined ? `${r.humidity.toFixed(1)}%` : '—'}
                          </TableCell>
                        ) : device.utility_type === 'sound' ? (
                          <TableCell className="font-mono">
                            {r.level !== null && r.level !== undefined ? `${r.level.toFixed(1)}%` : '—'}
                          </TableCell>
                        ) : device.utility_type === 'heating' ? (
                          <>
                            <TableCell className="font-mono">{r.temperature_in_c ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.temperature_out_c ?? '—'}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-mono">{r.pressure_bar ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.flow_rate ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.volume_m3 ?? '—'}</TableCell>
                            <TableCell className="font-mono">{r.temperature_c ?? '—'}</TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-border px-4 py-3">
                <Pagination
                  page={historyPage}
                  pages={
                    historyData.pages ??
                    Math.max(1, Math.ceil((historyData.total ?? historyData.readings.length) / historyPageSize))
                  }
                  total={historyData.total ?? historyData.readings.length}
                  pageSize={historyPageSize}
                  onPageChange={setHistoryPage}
                  onPageSizeChange={setHistoryPageSize}
                />
              </div>
            </Card>
          )}
        </div>
      ) : (
        <EmptyBlock title="Qurilma topilmadi" message="Ma'lumot yo'q" />
      )}

      {/* ── Tahrirlash paneli ── */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Qurilmani tahrirlash</SheetTitle>
            <SheetDescription>Qurilma nomi, joylashuvi va texnik sozlamalarini o'zgartirish.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleEdit} className="space-y-4 px-4 pb-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Qurilma nomi</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Masalan: A bino, 3-qavat elektr"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Datchik turi</Label>
                <Select value={editUtilityType} onValueChange={setEditUtilityType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electricity">Elektr</SelectItem>
                    <SelectItem value="water">Suv</SelectItem>
                    <SelectItem value="gas">Gaz</SelectItem>
                    <SelectItem value="soil">Yerto'la namligi</SelectItem>
                    <SelectItem value="sound">Ovoz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bino</Label>
                <Select value={editBuildingId} onValueChange={setEditBuildingId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Biriktirilmagan —</SelectItem>
                    {buildings?.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-floor">Qavat</Label>
                <Input id="edit-floor" value={editFloor} onChange={(e) => setEditFloor(e.target.value)} placeholder="1, 2, 3..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-room">Xona</Label>
                <Input id="edit-room" value={editRoom} onChange={(e) => setEditRoom(e.target.value)} placeholder="101, A, ..." />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group">Guruh nomi</Label>
              <Input
                id="edit-group"
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
                placeholder="Masalan: A-qanot, Asosiy linia"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Qurilma roli</Label>
                <Select value={editDeviceRole} onValueChange={setEditDeviceRole}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Belgilanmagan —</SelectItem>
                    <SelectItem value="meter">Meter</SelectItem>
                    <SelectItem value="gateway">Gateway</SelectItem>
                    <SelectItem value="sensor">Sensor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Firmware rejimi</Label>
                <Select value={editFirmwareMode} onValueChange={setEditFirmwareMode}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Belgilanmagan —</SelectItem>
                    <SelectItem value="dlms">DLMS</SelectItem>
                    <SelectItem value="pulse">Pulse</SelectItem>
                    <SelectItem value="modbus">Modbus</SelectItem>
                    <SelectItem value="soil">Soil</SelectItem>
                    <SelectItem value="sound">Sound</SelectItem>
                    <SelectItem value="lora_gateway">LoRa Gateway</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="edit-is-test"
                checked={editIsTestDevice}
                onCheckedChange={(checked) => setEditIsTestDevice(checked === true)}
              />
              <Label htmlFor="edit-is-test">Test qurilmasi</Label>
            </div>
            <SheetFooter className="flex-row justify-end gap-2 px-0">
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Buyruqni tasdiqlash ── */}
      <AlertDialog open={pendingCommand !== null} onOpenChange={(open) => !open && setPendingCommand(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCommand?.type === 'reboot'
                ? 'Qurilmani reboot qilish'
                : pendingCommand?.type === 'delete'
                  ? "Qurilmani butunlay o'chirish"
                  : "Qurilma statusini o'zgartirish"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCommand?.type === 'reboot'
                ? 'Bu buyruq ESP32 qurilmasini qayta yuklaydi. Amalni davom ettirasizmi?'
                : pendingCommand?.type === 'delete'
                  ? "Qurilma va uning barcha o'lchov ma'lumotlari bazadan butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi!"
                  : "Qurilmaning faol/faol emas holati o'zgartiriladi."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              className={
                pendingCommand?.type === 'delete'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : undefined
              }
              onClick={executePendingCommand}
            >
              {pendingCommand?.type === 'delete' ? "Ha, o'chirib yuborish" : 'Buyruq yuborish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
