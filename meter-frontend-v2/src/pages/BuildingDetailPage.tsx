import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ArrowLeft,
  Cpu,
  Droplets,
  Flame,
  Link2,
  MapPin,
  MonitorPlay,
  Pencil,
  Plus,
  Trash2,
  Unlink,
  Volume2,
  Zap,
} from 'lucide-react'
import { useBuildingById, useDevices, useHourlyStats, qk } from '@/hooks/queries'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { translations } from '@/i18n/translations'
import apiClient from '@/lib/api'
import { getApiErrorMessage } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/toast'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/StateBlock'
import { KPICard } from '@/components/KPICard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { LucideIcon } from 'lucide-react'

// ─── Leaflet xarita (bitta bino uchun) ───────────────────────────────────────

const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'

function markerIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function LocationMap({
  name,
  address,
  latitude,
  longitude,
}: {
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
}) {
  const { isDark } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || latitude == null || longitude == null) return
    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom: 17,
      zoomControl: true,
    })
    L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, {
      attribution: TILE_ATTR,
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    const popupHtml = `
      <div style="font-family:inherit;min-width:140px">
        <div style="font-weight:600;font-size:13px">${name}</div>
        ${address ? `<div style="font-size:11px;opacity:.7;margin-top:2px">${address}</div>` : ''}
        <div style="font-size:11px;opacity:.6;margin-top:3px;font-family:monospace">
          ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
        </div>
      </div>`
    L.marker([latitude, longitude], { icon: markerIcon() }).bindPopup(popupHtml).addTo(map)

    return () => {
      map.remove()
    }
  }, [name, address, latitude, longitude, isDark])

  if (latitude == null || longitude == null) {
    return (
      <EmptyBlock
        title="Koordinata topilmadi"
        message="Xaritada ko'rsatish uchun latitude/longitude kiriting."
      />
    )
  }

  return (
    <div className="relative h-[340px] w-full">
      <div ref={containerRef} className="absolute inset-0 z-0" />
    </div>
  )
}

// ─── Tahlil yordamchilari ─────────────────────────────────────────────────────

const UTILITY_ICONS: Record<string, LucideIcon> = {
  electricity: Zap,
  water: Droplets,
  gas: Flame,
  sound: Volume2,
}

function utilityLabel(utility: string): string {
  return (
    translations.deviceTypes[utility as keyof typeof translations.deviceTypes] ?? utility
  )
}

// ─── Sahifa ───────────────────────────────────────────────────────────────────

type ConfirmAction = { type: 'unbind'; deviceId: string } | { type: 'delete' }

export default function BuildingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const buildingIdInt = id ? parseInt(id) : 0
  const {
    data: building,
    isLoading: buildingLoading,
    isError: buildingIsError,
    error: buildingQueryError,
    refetch: refetchBuilding,
  } = useBuildingById(id ?? '')
  const {
    data: devices,
    isLoading: devicesLoading,
    isError: devicesIsError,
    error: devicesQueryError,
    refetch: refetchDevices,
  } = useDevices(500)
  const {
    data: hourly,
    isLoading: hourlyLoading,
    isError: hourlyIsError,
    error: hourlyQueryError,
    refetch: refetchHourly,
  } = useHourlyStats(24, buildingIdInt || undefined)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmPending, setConfirmPending] = useState(false)

  // Qurilma biriktirish
  const [isBindOpen, setIsBindOpen] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [binding, setBinding] = useState(false)
  const [bindError, setBindError] = useState<string | null>(null)

  // Binoni tahrirlash
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editFloors, setEditFloors] = useState(1)
  const [editEntrancesCount, setEditEntrancesCount] = useState(1)
  const [editDescription, setEditDescription] = useState('')
  const [updating, setUpdating] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const buildingDevices = useMemo(() => {
    if (!devices || !buildingIdInt) return []
    return devices.filter((d) => d.building_id === buildingIdInt)
  }, [devices, buildingIdInt])

  const unassignedDevices = useMemo(() => {
    if (!devices) return []
    return devices.filter((d) => !d.building_id)
  }, [devices])

  // Oxirgi 24 soatlik statistikadan utility bo'yicha xulosa
  const utilitySummary = useMemo(() => {
    const stats = hourly?.stats ?? []
    const byUtility = new Map<
      string,
      { deviceIds: Set<string>; samples: number; powerSum: number; powerN: number; flowSum: number; flowN: number; pressureSum: number; pressureN: number; humiditySum: number; humidityN: number; levelSum: number; levelN: number }
    >()
    for (const s of stats) {
      let agg = byUtility.get(s.utility_type)
      if (!agg) {
        agg = {
          deviceIds: new Set(),
          samples: 0,
          powerSum: 0,
          powerN: 0,
          flowSum: 0,
          flowN: 0,
          pressureSum: 0,
          pressureN: 0,
          humiditySum: 0,
          humidityN: 0,
          levelSum: 0,
          levelN: 0,
        }
        byUtility.set(s.utility_type, agg)
      }
      agg.deviceIds.add(s.device_id)
      agg.samples += s.samples
      if (s.avg_power_w != null) {
        agg.powerSum += s.avg_power_w
        agg.powerN += 1
      }
      if (s.avg_flow_rate != null) {
        agg.flowSum += s.avg_flow_rate
        agg.flowN += 1
      }
      if (s.avg_pressure_bar != null) {
        agg.pressureSum += s.avg_pressure_bar
        agg.pressureN += 1
      }
      if (s.avg_humidity != null) {
        agg.humiditySum += s.avg_humidity
        agg.humidityN += 1
      }
      if (s.avg_level != null) {
        agg.levelSum += s.avg_level
        agg.levelN += 1
      }
    }
    return Array.from(byUtility.entries()).map(([utility, agg]) => {
      let metric = '—'
      if (utility === 'electricity' && agg.powerN > 0) {
        metric = `${(agg.powerSum / agg.powerN).toFixed(0)} W`
      } else if (utility === 'water') {
        if (agg.flowN > 0) metric = `${(agg.flowSum / agg.flowN).toFixed(2)} l/min`
        else if (agg.pressureN > 0) metric = `${(agg.pressureSum / agg.pressureN).toFixed(2)} bar`
      } else if (utility === 'gas' && agg.pressureN > 0) {
        metric = `${(agg.pressureSum / agg.pressureN).toFixed(2)} bar`
      } else if (utility === 'soil' && agg.humidityN > 0) {
        metric = `${(agg.humiditySum / agg.humidityN).toFixed(1)} %`
      } else if (utility === 'sound' && agg.levelN > 0) {
        metric = `${(agg.levelSum / agg.levelN).toFixed(1)} dB`
      }
      return {
        utility,
        metric,
        deviceCount: agg.deviceIds.size,
        samples: agg.samples,
      }
    })
  }, [hourly])

  if (!id) {
    return <ErrorBlock title="Xato" message="Bino identifikatori topilmadi." />
  }

  const handleBindDevice = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedDeviceId) return
    setBinding(true)
    setBindError(null)
    try {
      const dev = devices?.find((d) => d.id === selectedDeviceId)
      if (!dev) {
        // Ro'yxatdan topilmasa PUT yuborilmaydi — muvaffaqiyat deb ko'rsatmaymiz
        const msg = "Qurilma ro'yxatdan topilmadi. Sahifani yangilab qayta urining."
        setBindError(msg)
        notifyError('Qurilma biriktirilmadi', msg)
        return
      }
      await apiClient.put(`/api/devices/${selectedDeviceId}`, {
        building_id: buildingIdInt,
        name: dev.name || null,
        utility_type: dev.utility_type,
        is_active: dev.is_active ?? true,
      })
      queryClient.invalidateQueries({ queryKey: qk.devices() })
      queryClient.invalidateQueries({ queryKey: qk.buildings() })
      queryClient.invalidateQueries({ queryKey: qk.summary() })
      setIsBindOpen(false)
      setSelectedDeviceId('')
      notifySuccess('Qurilma biriktirildi')
    } catch (err) {
      setBindError(getApiErrorMessage(err))
      notifyError('Qurilma biriktirilmadi', getApiErrorMessage(err))
    } finally {
      setBinding(false)
    }
  }

  const handleUnbindDevice = async (deviceId: string) => {
    setConfirmPending(true)
    try {
      const dev = devices?.find((d) => d.id === deviceId)
      if (dev) {
        await apiClient.put(`/api/devices/${deviceId}`, {
          building_id: null,
          name: dev.name || null,
          utility_type: dev.utility_type,
          is_active: dev.is_active ?? true,
        })
      }
      queryClient.invalidateQueries({ queryKey: qk.devices() })
      queryClient.invalidateQueries({ queryKey: qk.buildings() })
      queryClient.invalidateQueries({ queryKey: qk.summary() })
      notifySuccess('Qurilma binodan uzildi')
    } catch (err) {
      notifyError('Qurilmani uzishda xatolik', getApiErrorMessage(err))
    } finally {
      setConfirmPending(false)
      setConfirmAction(null)
    }
  }

  const openEditDialog = () => {
    if (!building) return
    setEditName(building.name)
    setEditAddress(building.address ?? '')
    setEditFloors(building.floors)
    setEditEntrancesCount(building.entrances_count)
    setEditDescription(building.description ?? '')
    setEditError(null)
    setIsEditOpen(true)
  }

  const handleEditBuilding = async (e: FormEvent) => {
    e.preventDefault()
    if (!editName.trim()) return
    setUpdating(true)
    setEditError(null)
    try {
      await apiClient.put(`/api/buildings/${buildingIdInt}`, {
        name: editName,
        address: editAddress || null,
        floors: editFloors,
        entrances_count: editEntrancesCount,
        description: editDescription || null,
      })
      queryClient.invalidateQueries({ queryKey: qk.buildingDetail(id) })
      queryClient.invalidateQueries({ queryKey: qk.buildings() })
      setIsEditOpen(false)
      notifySuccess('Bino yangilandi')
    } catch (err) {
      setEditError(getApiErrorMessage(err))
    } finally {
      setUpdating(false)
    }
  }

  const handleDeleteBuilding = async () => {
    setConfirmPending(true)
    try {
      await apiClient.delete(`/api/buildings/${buildingIdInt}`)
      queryClient.invalidateQueries({ queryKey: qk.buildings() })
      notifySuccess("Bino o'chirildi")
      navigate('/buildings')
    } catch (err) {
      notifyError("Binoni o'chirishda xatolik", getApiErrorMessage(err))
    } finally {
      setConfirmPending(false)
      setConfirmAction(null)
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" />
        Orqaga
      </Button>

      {buildingLoading ? (
        <LoadingBlock
          title="Bino yuklanmoqda..."
          message="Bino ma'lumotlari va bog'langan qurilmalar olinmoqda."
        />
      ) : buildingIsError ? (
        <ErrorBlock
          title="Bino ma'lumotlari olinmadi"
          message={getApiErrorMessage(buildingQueryError)}
          onRetry={() => refetchBuilding()}
        />
      ) : building ? (
        <div className="space-y-6">
          {/* Sarlavha */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{building.name}</h1>
              {!building.is_active && <Badge variant="destructive">Nofaol</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/display?building_id=${building.id}`, '_blank')}
              >
                <MonitorPlay className="h-4 w-4" />
                Display
              </Button>
              {isAdmin && (
                <>
                  <Button variant="outline" size="sm" onClick={openEditDialog}>
                    <Pencil className="h-4 w-4" />
                    Tahrirlash
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmAction({ type: 'delete' })}
                  >
                    <Trash2 className="h-4 w-4" />
                    O'chirish
                  </Button>
                </>
              )}
            </div>
          </div>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Umumiy</TabsTrigger>
              <TabsTrigger value="devices">
                Qurilmalar ({buildingDevices.length})
              </TabsTrigger>
              <TabsTrigger value="analytics">Tahlil</TabsTrigger>
            </TabsList>

            {/* ─── Umumiy ─── */}
            <TabsContent value="overview" className="mt-4 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Bino ma'lumotlari</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-3">
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                        Manzil
                      </p>
                      <p className="font-medium">{building.address ?? '—'}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                        Koordinatalar
                      </p>
                      <p className="font-medium">
                        {building.latitude != null && building.longitude != null
                          ? `${building.latitude}, ${building.longitude}`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                        Tashkilot
                      </p>
                      <p className="font-medium">{building.organization_name ?? '—'}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                        Qavatlar soni
                      </p>
                      <p className="font-medium">{building.floors}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                        Kirish joylari
                      </p>
                      <p className="font-medium">{building.entrances_count}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                        Tashqi / ichki harorat
                      </p>
                      <p className="font-medium">
                        {building.ext_sensor_temp_out != null
                          ? `${building.ext_sensor_temp_out}°C`
                          : '—'}{' '}
                        /{' '}
                        {building.ext_sensor_temp_in != null
                          ? `${building.ext_sensor_temp_in}°C`
                          : '—'}
                      </p>
                    </div>
                  </div>
                  {building.description && (
                    <div className="border-t pt-4 text-sm">
                      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                        Tavsif
                      </p>
                      <p>{building.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden pb-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {building.name} — xarita
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <LocationMap
                    name={building.name}
                    address={building.address}
                    latitude={building.latitude}
                    longitude={building.longitude}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Qurilmalar ─── */}
            <TabsContent value="devices" className="mt-4 space-y-4">
              <Card className="gap-4">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      Biriktirilgan qurilmalar ({buildingDevices.length})
                    </CardTitle>
                    {isAdmin && (
                      <Button size="sm" onClick={() => setIsBindOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Qurilma biriktirish
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {devicesLoading ? (
                    <div className="p-4">
                      <LoadingBlock
                        title="Qurilmalar yuklanmoqda..."
                        message="Bino bilan bog'langan qurilmalar tekshirilmoqda."
                      />
                    </div>
                  ) : devicesIsError ? (
                    <div className="p-4">
                      <ErrorBlock
                        title="Qurilmalar olinmadi"
                        message={getApiErrorMessage(devicesQueryError)}
                        onRetry={() => refetchDevices()}
                      />
                    </div>
                  ) : buildingDevices.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Holat</TableHead>
                            <TableHead>Qurilma nomi / ID</TableHead>
                            <TableHead>Turi</TableHead>
                            {isAdmin && <TableHead className="text-right">Amallar</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {buildingDevices.map((device) => (
                            <TableRow key={device.id}>
                              <TableCell>
                                <span
                                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                                    device.online ? 'bg-emerald-500' : 'bg-red-500'
                                  }`}
                                  title={device.online ? 'Onlayn' : 'Offlayn'}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                <Link
                                  to={`/devices/${device.id}`}
                                  className="hover:text-primary hover:underline"
                                >
                                  {device.name ?? device.id}
                                </Link>
                              </TableCell>
                              <TableCell>{utilityLabel(device.utility_type)}</TableCell>
                              {isAdmin && (
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Binodan uzish"
                                    className="text-red-500 hover:text-red-500"
                                    onClick={() =>
                                      setConfirmAction({ type: 'unbind', deviceId: device.id })
                                    }
                                  >
                                    <Unlink className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-4">
                      <EmptyBlock
                        title="Qurilma biriktirilmagan"
                        message="Ushbu binoga hali hech qanday qurilma biriktirilmagan."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Tahlil ─── */}
            <TabsContent value="analytics" className="mt-4 space-y-4">
              <div>
                <h2 className="font-semibold">Sarf bo'yicha xulosa</h2>
                <p className="text-sm text-muted-foreground">
                  Ushbu binoga biriktirilgan qurilmalar bo'yicha oxirgi 24 soat
                </p>
              </div>
              {hourlyLoading ? (
                <LoadingBlock title="Tahlil yuklanmoqda..." />
              ) : hourlyIsError ? (
                <ErrorBlock
                  title="Tahlil olinmadi"
                  message={getApiErrorMessage(hourlyQueryError)}
                  onRetry={() => refetchHourly()}
                />
              ) : utilitySummary.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {utilitySummary.map((item) => (
                    <KPICard
                      key={item.utility}
                      title={utilityLabel(item.utility)}
                      value={item.metric}
                      subtitle={`${item.deviceCount} ta qurilma · ${item.samples} ta o'lchov`}
                      icon={UTILITY_ICONS[item.utility] ?? Cpu}
                    />
                  ))}
                </div>
              ) : (
                <EmptyBlock
                  title="Ma'lumot topilmadi"
                  message="Oxirgi 24 soat ichida bu bino bo'yicha o'lchov yozuvlari yo'q."
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <EmptyBlock title="Bino topilmadi" message="Ma'lumot topilmadi" />
      )}

      {/* Binoni tahrirlash dialogi */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Binoni tahrirlash</DialogTitle>
            <DialogDescription>Bino ma'lumotlarini yangilang.</DialogDescription>
          </DialogHeader>
          {editError && (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
              {editError}
            </p>
          )}
          <form onSubmit={handleEditBuilding} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Bino nomi *</Label>
              <Input
                id="edit-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">Manzil</Label>
              <Input
                id="edit-address"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-floors">Qavatlar soni</Label>
                <Input
                  id="edit-floors"
                  type="number"
                  min={1}
                  value={editFloors}
                  onChange={(e) => setEditFloors(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-entrances">Kirishlar soni</Label>
                <Input
                  id="edit-entrances"
                  type="number"
                  min={1}
                  value={editEntrancesCount}
                  onChange={(e) => setEditEntrancesCount(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Tavsif</Label>
              <Textarea
                id="edit-description"
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={updating}>
                {updating ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Qurilma biriktirish dialogi */}
      <Dialog
        open={isBindOpen}
        onOpenChange={(open) => {
          setIsBindOpen(open)
          if (!open) {
            setSelectedDeviceId('')
            setBindError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Qurilma biriktirish
            </DialogTitle>
            <DialogDescription>
              Bo'sh turgan qurilmani ushbu binoga biriktiring.
            </DialogDescription>
          </DialogHeader>
          {bindError && (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
              {bindError}
            </p>
          )}
          <form onSubmit={handleBindDevice} className="space-y-4">
            <div className="space-y-2">
              <Label>Bo'sh turgan qurilma *</Label>
              {unassignedDevices.length > 0 ? (
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Qurilma tanlang..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unassignedDevices.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name ?? d.id} ({utilityLabel(d.utility_type)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="rounded-md border bg-muted/50 p-3 text-xs italic text-muted-foreground">
                  Hozirda biriktirilmagan bo'sh qurilmalar mavjud emas. Yangi qurilma qo'shing.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsBindOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={binding || !selectedDeviceId}>
                {binding ? 'Biriktirilmoqda...' : 'Biriktirish'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tasdiqlash dialogi */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'delete' ? "Binoni o'chirish" : 'Qurilmani uzish'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'delete'
                ? "Bu bino va uning barcha ulanishlari o'chiriladi. Amalni davom ettirasizmi?"
                : 'Qurilma binodan uziladi. Amalni davom ettirasizmi?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmPending}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmPending}
              className="bg-red-500 text-white hover:bg-red-500/90"
              onClick={(e) => {
                e.preventDefault()
                if (confirmAction?.type === 'delete') handleDeleteBuilding()
                else if (confirmAction?.type === 'unbind') handleUnbindDevice(confirmAction.deviceId)
              }}
            >
              {confirmPending
                ? 'Bajarilmoqda...'
                : confirmAction?.type === 'delete'
                  ? "O'chirish"
                  : 'Uzish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
