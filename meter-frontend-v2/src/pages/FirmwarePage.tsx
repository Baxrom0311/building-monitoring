import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  Cpu,
  Eye,
  PlayCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDevices, useFirmwareList, useOtaBatches, qk } from '@/hooks/queries'
import apiClient from '@/lib/api'
import { formatTs } from '@/lib/utils'
import type { Device, Firmware, OtaBatch, OtaBatchDetail } from '@/types/api'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/StateBlock'
import { getApiErrorMessage } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/toast'
import { Pagination } from '@/components/Pagination'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const FW_PAGE_SIZE = 10
const BATCH_PAGE_SIZE = 10

const UTILITY_OPTIONS = [
  { value: 'electricity', label: 'Elektr' },
  { value: 'water', label: 'Suv' },
  { value: 'gas', label: 'Gaz' },
  { value: 'soil', label: "Yerto'la" },
  { value: 'sound', label: 'Ovoz' },
]

const MODE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  ...UTILITY_OPTIONS,
  { value: 'lora_gateway', label: 'LoRa Gateway' },
  { value: 'display', label: 'Display' },
]

function formatSize(size: number | null | undefined) {
  if (!size) return '-'
  return `${(size / 1024).toFixed(1)} KB`
}

function shortSha(sha: string | null | undefined) {
  if (!sha) return '-'
  return sha.slice(0, 12)
}

function batchStatusBadge(status: string) {
  if (status === 'completed')
    return <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">{status}</Badge>
  if (status === 'failed' || status === 'cancelled')
    return <Badge variant="outline" className="border-red-500/30 text-red-500">{status}</Badge>
  if (status === 'in_progress')
    return <Badge variant="outline" className="border-amber-500/30 text-amber-500">{status}</Badge>
  return <Badge variant="outline" className="text-muted-foreground">{status}</Badge>
}

function deviceStatusBadge(status: string) {
  if (status === 'success' || status === 'completed')
    return <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">{status}</Badge>
  if (status === 'failed')
    return <Badge variant="outline" className="border-red-500/30 text-red-500">{status}</Badge>
  if (status === 'notified' || status === 'in_progress')
    return <Badge variant="outline" className="border-amber-500/30 text-amber-500">{status}</Badge>
  return <Badge variant="outline" className="text-muted-foreground">{status}</Badge>
}

// ── Batch detail dialog (per-device progress + push) ─────────────────────────
function BatchDetailDialog({
  batchId,
  onClose,
}: {
  batchId: number | null
  onClose: () => void
}) {
  const [pushingDeviceId, setPushingDeviceId] = useState<string | null>(null)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ota-batches', 'detail', batchId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/ota/batches/${batchId}`)
      return (data.batch ?? data) as OtaBatchDetail
    },
    enabled: batchId !== null,
  })

  const pushDevice = async (deviceId: string) => {
    setPushingDeviceId(deviceId)
    try {
      await apiClient.post(`/api/ota/push/${deviceId}`)
      notifySuccess('OTA push yuborildi', deviceId)
    } catch (err) {
      notifyError('OTA push yuborilmadi', getApiErrorMessage(err))
    } finally {
      setPushingDeviceId(null)
    }
  }

  return (
    <Dialog open={batchId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Batch tafsilotlari</DialogTitle>
          <DialogDescription>
            {data ? `${data.name} — firmware v${data.firmware?.version ?? data.firmware_id}` : `Batch #${batchId}`}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <LoadingBlock title="Batch yuklanmoqda" />
        ) : isError ? (
          <ErrorBlock message={getApiErrorMessage(error)} onRetry={() => refetch()} />
        ) : data ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Progress value={Math.min(data.progress_percentage || 0, 100)} className="flex-1" />
              <span className="font-mono text-sm">{data.progress_percentage || 0}%</span>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="text-emerald-500">{data.success_count} ok</span>
              {' / '}
              <span className="text-red-500">{data.failure_count} fail</span>
              {' / '}
              <span className="text-amber-500">{data.pending_count} pending</span>
              {' — jami '}
              {data.total_devices}
            </p>
            <ScrollArea className="max-h-80 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Qurilma</TableHead>
                    <TableHead>Holat</TableHead>
                    <TableHead>Eski versiya</TableHead>
                    <TableHead className="text-right">Push</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.devices ?? []).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.device_id}</TableCell>
                      <TableCell>{deviceStatusBadge(d.status)}</TableCell>
                      <TableCell className="font-mono text-xs">{d.previous_version ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="OTA push"
                          disabled={pushingDeviceId === d.device_id}
                          onClick={() => pushDevice(d.device_id)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default function FirmwarePage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const {
    data: firmwareList = [],
    isLoading,
    isError,
    error: firmwareQueryError,
    refetch: refetchFirmware,
  } = useFirmwareList()
  const {
    data: batches = [],
    isLoading: batchesLoading,
    isError: batchesError,
    error: batchesQueryError,
    refetch: refetchBatches,
  } = useOtaBatches(isAdmin)
  const { data: devices = [] } = useDevices()

  // ── Upload dialog state ─────────────────────────────────────────────────────
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [hardwareVersion, setHardwareVersion] = useState('')
  const [utilityType, setUtilityType] = useState('electricity')
  const [firmwareMode, setFirmwareMode] = useState('auto')
  const [deviceRole, setDeviceRole] = useState('')
  const [sensorType, setSensorType] = useState('')
  const [converterType, setConverterType] = useState('')
  const [minVersion, setMinVersion] = useState('')
  const [rolloutPercentage, setRolloutPercentage] = useState(100)
  const [isStable, setIsStable] = useState(true)
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // ── Batch create state ─────────────────────────────────────────────────────
  const [batchName, setBatchName] = useState('')
  const [selectedFirmwareId, setSelectedFirmwareId] = useState('')
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([])
  const [devicesPerHour, setDevicesPerHour] = useState(100)
  const [scheduledAt, setScheduledAt] = useState('')
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [workingBatchId, setWorkingBatchId] = useState<number | null>(null)
  const [detailBatchId, setDetailBatchId] = useState<number | null>(null)

  // ── Delete firmware ────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Firmware | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [fwPage, setFwPage] = useState(1)
  const [batchPage, setBatchPage] = useState(1)

  const fwList: Firmware[] = firmwareList
  const fwTotalPages = Math.max(1, Math.ceil(fwList.length / FW_PAGE_SIZE))
  const pagedFirmware = useMemo(
    () => fwList.slice((fwPage - 1) * FW_PAGE_SIZE, fwPage * FW_PAGE_SIZE),
    [fwList, fwPage],
  )
  const batchTotalPages = Math.max(1, Math.ceil(batches.length / BATCH_PAGE_SIZE))
  const pagedBatches = useMemo(
    () => batches.slice((batchPage - 1) * BATCH_PAGE_SIZE, batchPage * BATCH_PAGE_SIZE),
    [batches, batchPage],
  )

  const selectedFirmware = useMemo(
    () => fwList.find((fw) => String(fw.id) === selectedFirmwareId),
    [fwList, selectedFirmwareId],
  )

  const compatibleDevices = useMemo(() => {
    if (!selectedFirmware?.utility_type) return devices
    return devices.filter((device: Device) => device.utility_type === selectedFirmware.utility_type)
  }, [devices, selectedFirmware])

  const resetUploadForm = () => {
    setVersion('')
    setHardwareVersion('')
    setUtilityType('electricity')
    setFirmwareMode('auto')
    setDeviceRole('')
    setSensorType('')
    setConverterType('')
    setMinVersion('')
    setRolloutPercentage(100)
    setIsStable(true)
    setNotes('')
    setFile(null)
    setUploadError(null)
  }

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!version.trim() || !file) return
    setSubmitting(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append('version', version.trim())
    formData.append('notes', notes)
    formData.append('hardware_version', hardwareVersion.trim())
    formData.append('firmware_mode', firmwareMode)
    formData.append('utility_type', utilityType)
    formData.append('device_role', deviceRole.trim())
    formData.append('sensor_type', sensorType.trim())
    formData.append('converter_type', converterType.trim())
    formData.append('is_stable', String(isStable))
    formData.append('min_version', minVersion.trim())
    formData.append('rollout_percentage', String(rolloutPercentage))
    formData.append('file', file)

    try {
      await apiClient.post('/api/ota/upload', formData)
      await queryClient.invalidateQueries({ queryKey: qk.firmware() })
      setIsUploadOpen(false)
      const uploadedVersion = version.trim()
      resetUploadForm()
      notifySuccess('Firmware yuklandi', `v${uploadedVersion} katalogga qo'shildi.`)
    } catch (err) {
      setUploadError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteFirmware = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiClient.delete(`/api/ota/${deleteTarget.id}`)
      await queryClient.invalidateQueries({ queryKey: qk.firmware() })
      notifySuccess("Firmware o'chirildi", `v${deleteTarget.version}`)
      setDeleteTarget(null)
    } catch (err) {
      notifyError("Firmware o'chirilmadi", getApiErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds((current) =>
      current.includes(deviceId) ? current.filter((id) => id !== deviceId) : [...current, deviceId],
    )
  }

  const handleCreateBatch = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedFirmwareId || selectedDeviceIds.length === 0) return
    setBatchSubmitting(true)
    setBatchError(null)

    const scheduledTs = scheduledAt ? Math.floor(new Date(scheduledAt).getTime() / 1000) : null
    try {
      await apiClient.post('/api/ota/batches', {
        name: batchName.trim() || `OTA ${selectedFirmware?.version ?? selectedFirmwareId}`,
        firmware_id: Number(selectedFirmwareId),
        device_ids: selectedDeviceIds,
        devices_per_hour: devicesPerHour,
        scheduled_at: scheduledTs,
      })
      await queryClient.invalidateQueries({ queryKey: qk.otaBatches() })
      setBatchName('')
      setSelectedFirmwareId('')
      setSelectedDeviceIds([])
      setDevicesPerHour(100)
      setScheduledAt('')
      notifySuccess('OTA batch yaratildi')
    } catch (err) {
      setBatchError(getApiErrorMessage(err))
    } finally {
      setBatchSubmitting(false)
    }
  }

  const processBatch = async (batchId: number) => {
    setWorkingBatchId(batchId)
    try {
      await apiClient.post(`/api/ota/batches/${batchId}/process`)
      await queryClient.invalidateQueries({ queryKey: qk.otaBatches() })
      notifySuccess('OTA batch ishga tushdi')
    } catch (err) {
      notifyError("OTA batchni ishga tushirib bo'lmadi", getApiErrorMessage(err))
    } finally {
      setWorkingBatchId(null)
    }
  }

  const cancelBatch = async (batchId: number) => {
    setWorkingBatchId(batchId)
    try {
      await apiClient.post(`/api/ota/batches/${batchId}/cancel`)
      await queryClient.invalidateQueries({ queryKey: qk.otaBatches() })
      notifySuccess('OTA batch bekor qilindi')
    } catch (err) {
      notifyError("OTA batchni bekor qilib bo'lmadi", getApiErrorMessage(err))
    } finally {
      setWorkingBatchId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">Firmware</h1>
        </div>
        {isAdmin && (
          <Button onClick={() => { resetUploadForm(); setIsUploadOpen(true) }}>
            <UploadCloud className="h-4 w-4" />
            Yangi firmware
          </Button>
        )}
      </div>

      <Tabs defaultValue="firmware">
        <TabsList>
          <TabsTrigger value="firmware">Firmware</TabsTrigger>
          <TabsTrigger value="batches">OTA Batchlar</TabsTrigger>
        </TabsList>

        {/* ── Firmware tab ── */}
        <TabsContent value="firmware" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Firmware katalogi</p>
            <Button
              variant="ghost"
              size="icon"
              title="Yangilash"
              onClick={() => queryClient.invalidateQueries({ queryKey: qk.firmware() })}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <LoadingBlock title="Firmware katalogi yuklanmoqda" />
          ) : isError ? (
            <ErrorBlock message={getApiErrorMessage(firmwareQueryError)} onRetry={() => refetchFirmware()} />
          ) : fwList.length > 0 ? (
            <Card>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Versiya</TableHead>
                        <TableHead>Turi / Mode</TableHead>
                        <TableHead>Sensor</TableHead>
                        <TableHead>Hajm</TableHead>
                        <TableHead>SHA256</TableHead>
                        <TableHead>Rollout</TableHead>
                        <TableHead>Holat</TableHead>
                        {isAdmin && <TableHead className="text-right">Amallar</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedFirmware.map((fw) => (
                        <TableRow key={fw.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium">v{fw.version}</span>
                              {fw.is_stable && (
                                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">
                                  <ShieldCheck className="h-4 w-4" />
                                  Stable
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 max-w-56 truncate font-mono text-xs text-muted-foreground">
                              {fw.filename}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p>{fw.utility_type ?? '-'}</p>
                            <p className="text-xs text-muted-foreground">{fw.firmware_mode}</p>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{fw.sensor_type || '-'}</TableCell>
                          <TableCell className="font-mono">{formatSize(fw.size)}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{shortSha(fw.sha256)}</TableCell>
                          <TableCell className="font-mono">{fw.rollout_percentage ?? 100}%</TableCell>
                          <TableCell>
                            {fw.active ? (
                              <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">Faol</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">Faol emas</Badge>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="O'chirish"
                                className="text-red-500 hover:text-red-500"
                                onClick={() => setDeleteTarget(fw)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Pagination
                  page={fwPage}
                  pages={fwTotalPages}
                  total={fwList.length}
                  pageSize={FW_PAGE_SIZE}
                  onPageChange={setFwPage}
                />
              </CardContent>
            </Card>
          ) : (
            <EmptyBlock title="Ma'lumot yo'q" message="Hozircha yuklangan firmware fayllari mavjud emas" />
          )}
        </TabsContent>

        {/* ── OTA Batches tab ── */}
        <TabsContent value="batches" className="space-y-4">
          {!isAdmin ? (
            <EmptyBlock title="Ruxsat yo'q" message="Batch boshqaruvi faqat admin uchun." />
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">OTA batchlar</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Yangilash"
                    onClick={() => queryClient.invalidateQueries({ queryKey: qk.otaBatches() })}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                {batchesLoading ? (
                  <LoadingBlock title="OTA batchlar yuklanmoqda" />
                ) : batchesError ? (
                  <ErrorBlock message={getApiErrorMessage(batchesQueryError)} onRetry={() => refetchBatches()} />
                ) : batches.length > 0 ? (
                  <Card>
                    <CardContent className="space-y-4">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nomi</TableHead>
                              <TableHead>Holat</TableHead>
                              <TableHead className="min-w-40">Progress</TableHead>
                              <TableHead>Qurilmalar</TableHead>
                              <TableHead>Boshlash vaqti</TableHead>
                              <TableHead className="text-right">Amallar</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedBatches.map((batch: OtaBatch) => (
                              <TableRow key={batch.id}>
                                <TableCell>
                                  <p className="font-medium">{batch.name}</p>
                                  <p className="font-mono text-xs text-muted-foreground">FW #{batch.firmware_id}</p>
                                </TableCell>
                                <TableCell>{batchStatusBadge(batch.status)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Progress value={Math.min(batch.progress_percentage || 0, 100)} className="flex-1" />
                                    <span className="w-10 font-mono text-xs">{batch.progress_percentage || 0}%</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs">
                                  <span className="text-emerald-500">{batch.success_count} ok</span>
                                  {' / '}
                                  <span className="text-red-500">{batch.failure_count} fail</span>
                                  {' / '}
                                  <span className="text-amber-500">{batch.pending_count} pending</span>
                                  <p className="text-muted-foreground">Jami: {batch.total_devices}</p>
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  {formatTs(batch.scheduled_at)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Tafsilotlar"
                                      onClick={() => setDetailBatchId(batch.id)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Process"
                                      className="text-emerald-500 hover:text-emerald-500"
                                      disabled={
                                        workingBatchId === batch.id ||
                                        ['completed', 'cancelled'].includes(batch.status)
                                      }
                                      onClick={() => processBatch(batch.id)}
                                    >
                                      <PlayCircle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Cancel"
                                      className="text-red-500 hover:text-red-500"
                                      disabled={
                                        workingBatchId === batch.id ||
                                        ['completed', 'cancelled'].includes(batch.status)
                                      }
                                      onClick={() => cancelBatch(batch.id)}
                                    >
                                      <Ban className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <Pagination
                        page={batchPage}
                        pages={batchTotalPages}
                        total={batches.length}
                        pageSize={BATCH_PAGE_SIZE}
                        onPageChange={setBatchPage}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyBlock title="OTA batchlar mavjud emas" message="Hozircha hech qanday rollout batch yaratilmagan." />
                )}
              </div>

              {/* Batch create form */}
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="text-base">OTA batch yaratish</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateBatch} className="space-y-4 text-sm">
                    {batchError && (
                      <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                        {batchError}
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="fw-batch-name">Batch nomi</Label>
                      <Input
                        id="fw-batch-name"
                        value={batchName}
                        onChange={(e) => setBatchName(e.target.value)}
                        placeholder="Masalan: Suv node v2.0 rollout"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Firmware</Label>
                      <Select
                        value={selectedFirmwareId}
                        onValueChange={(v) => {
                          setSelectedFirmwareId(v)
                          setSelectedDeviceIds([])
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Firmware tanlang" />
                        </SelectTrigger>
                        <SelectContent>
                          {fwList.map((fw) => (
                            <SelectItem key={fw.id} value={String(fw.id)}>
                              v{fw.version} — {fw.utility_type || 'any'} / {fw.firmware_mode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="fw-per-hour">Soatiga qurilma</Label>
                        <Input
                          id="fw-per-hour"
                          type="number"
                          min={1}
                          max={10000}
                          value={devicesPerHour}
                          onChange={(e) => setDevicesPerHour(Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="fw-scheduled">Boshlash vaqti</Label>
                        <Input
                          id="fw-scheduled"
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Vaqt bo'sh qoldirilsa OTA batch darhol boshlanadi.
                    </p>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Qurilmalar</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedDeviceIds(compatibleDevices.map((d: Device) => d.id))}
                          >
                            Hammasi
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedDeviceIds([])}>
                            Tozalash
                          </Button>
                        </div>
                      </div>
                      <ScrollArea className="h-56 rounded-md border">
                        {compatibleDevices.length > 0 ? (
                          <div className="divide-y">
                            {compatibleDevices.map((device: Device) => (
                              <label
                                key={device.id}
                                className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate">{device.name || device.id}</span>
                                  <span className="block font-mono text-xs text-muted-foreground">
                                    {device.utility_type} / {device.fw_version || device.software_version || '-'}
                                  </span>
                                </span>
                                <Checkbox
                                  checked={selectedDeviceIds.includes(device.id)}
                                  onCheckedChange={() => toggleDevice(device.id)}
                                />
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="p-3 text-sm text-muted-foreground">Mos qurilma topilmadi.</p>
                        )}
                      </ScrollArea>
                      <p className="text-xs text-muted-foreground">{selectedDeviceIds.length} ta qurilma tanlandi</p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={batchSubmitting || !selectedFirmwareId || selectedDeviceIds.length === 0}
                    >
                      <PlayCircle className="h-4 w-4" />
                      {batchSubmitting ? 'Yaratilmoqda...' : 'Batch yaratish'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Upload dialog ── */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yangi firmware yuklash</DialogTitle>
            <DialogDescription>.bin faylni tanlang va metadata kiriting.</DialogDescription>
          </DialogHeader>
          {uploadError && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{uploadError}</p>
          )}
          <form onSubmit={handleUpload} className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="fw-file">Firmware fayli (.bin) *</Label>
              <Input
                id="fw-file"
                type="file"
                required
                accept=".bin"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="fw-version">Versiya *</Label>
                <Input
                  id="fw-version"
                  required
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="3.3.0"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fw-min-version">Min versiya</Label>
                <Input
                  id="fw-min-version"
                  value={minVersion}
                  onChange={(e) => setMinVersion(e.target.value)}
                  placeholder="1.0.0"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fw-rollout">Rollout %</Label>
                <Input
                  id="fw-rollout"
                  type="number"
                  min={0}
                  max={100}
                  value={rolloutPercentage}
                  onChange={(e) => setRolloutPercentage(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Utility</Label>
                <Select value={utilityType} onValueChange={setUtilityType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UTILITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Firmware mode</Label>
                <Select value={firmwareMode} onValueChange={setFirmwareMode}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fw-role">Device role</Label>
                <Input
                  id="fw-role"
                  value={deviceRole}
                  onChange={(e) => setDeviceRole(e.target.value)}
                  placeholder="water_node"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="fw-hw">Hardware</Label>
                <Input
                  id="fw-hw"
                  value={hardwareVersion}
                  onChange={(e) => setHardwareVersion(e.target.value)}
                  placeholder="HW-1.0"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fw-sensor">Sensor</Label>
                <Input
                  id="fw-sensor"
                  value={sensorType}
                  onChange={(e) => setSensorType(e.target.value)}
                  placeholder="pressure_4_20ma"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fw-converter">Converter</Label>
                <Input
                  id="fw-converter"
                  value={converterType}
                  onChange={(e) => setConverterType(e.target.value)}
                  placeholder="ADS1115"
                />
              </div>
            </div>

            <label className="flex items-center gap-2">
              <Checkbox checked={isStable} onCheckedChange={(v) => setIsStable(v === true)} />
              <span className="select-none">Stable release</span>
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="fw-notes">Changelog / Izohlar</Label>
              <Textarea
                id="fw-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Qanday yangilanishlar kiritildi..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Yuklanmoqda...' : 'Yuklash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete firmware AlertDialog ── */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Firmware o'chirilsinmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `v${deleteTarget.version} (${deleteTarget.filename}) butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-500/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDeleteFirmware()
              }}
            >
              {deleting ? "O'chirilmoqda..." : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BatchDetailDialog batchId={detailBatchId} onClose={() => setDetailBatchId(null)} />
    </div>
  )
}
