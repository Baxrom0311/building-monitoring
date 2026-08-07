import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Columns3, Download, Link2, MoreHorizontal, Plus, Search } from 'lucide-react'
import { useDevicesList, useBuildings, qk } from '@/hooks/queries'
import { useAuth } from '@/contexts/AuthContext'
import apiClient from '@/lib/api'
import { getApiErrorMessage } from '@/lib/errors'
import { notifySuccess } from '@/lib/toast'
import { downloadCsv, useColumnVisibility, type TableColumn } from '@/lib/table'
import { cn } from '@/lib/utils'
import type { Device } from '@/types/api'
import { EmptyBlock, ErrorBlock, TableSkeleton } from '@/components/StateBlock'
import { Pagination } from '@/components/Pagination'
import { StatusPulse } from '@/components/ui/StatusPulse'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

const DEFAULT_PAGE_SIZE = 20

const UTILITY_OPTIONS = [
  { key: 'electricity', label: 'Elektr' },
  { key: 'water', label: 'Suv' },
  { key: 'gas', label: 'Gaz' },
  { key: 'soil', label: "Yerto'la namligi" },
  { key: 'sound', label: 'Ovoz' },
] as const

function utilityLabel(type: string) {
  return UTILITY_OPTIONS.find((u) => u.key === type)?.label ?? type
}

const deviceTableColumns: TableColumn[] = [
  { key: 'status', label: 'Holat' },
  { key: 'id', label: 'ID / nom' },
  { key: 'type', label: 'Tur' },
  { key: 'firmware', label: 'Firmware' },
  { key: 'actions', label: 'Amallar' },
]

type StatusFilter = 'all' | 'online' | 'offline'
type SortBy = 'name' | 'type' | 'status' | 'last_seen'

function OnlineBadge({ online }: { online: boolean | null }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 py-0.5 px-2 font-medium',
        online
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
          : 'border-muted bg-muted/30 text-muted-foreground',
      )}
    >
      <StatusPulse status={Boolean(online)} size="sm" />
      <span>{online ? 'Online' : 'Offline'}</span>
    </Badge>
  )
}

export default function DevicesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('last_seen')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // ── Add-device dialog ─────────────────────────────────────────────────────
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [name, setName] = useState('')
  const [utilityType, setUtilityType] = useState('electricity')
  const [buildingId, setBuildingId] = useState('none')
  const [meterType, setMeterType] = useState('')
  const [meterSerial, setMeterSerial] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // ── Quick-assign dialog ───────────────────────────────────────────────────
  const [deviceToAssign, setDeviceToAssign] = useState<Device | null>(null)
  const [assignName, setAssignName] = useState('')
  const [assignBuildingId, setAssignBuildingId] = useState('none')

  const { isColumnVisible, toggleColumn } = useColumnVisibility(deviceTableColumns, 'devices-table-columns')
  const { data: buildings } = useBuildings()

  // URL dan utility filtrini o'qish (masalan /devices?utility=water)
  useEffect(() => {
    const utility = new URLSearchParams(location.search).get('utility')
    if (utility && UTILITY_OPTIONS.some((u) => u.key === utility)) {
      setTypeFilter(utility)
    }
  }, [location.search])

  // Filtr o'zgarganda sahifani boshiga qaytarish
  useEffect(() => {
    setPage(1)
  }, [searchQuery, typeFilter, statusFilter, sortBy])

  // ── Server query ──────────────────────────────────────────────────────────
  const { data, isLoading, isError, error: queryError, refetch, isFetching } = useDevicesList({
    page,
    pageSize,
    q: searchQuery.trim() || undefined,
    utilityType: typeFilter !== 'all' ? typeFilter : undefined,
    online: statusFilter === 'online' ? true : statusFilter === 'offline' ? false : undefined,
    sortBy,
    // last_seen/status bo'yicha eng yangi birinchi, nom/tur bo'yicha alifbo tartibida
    sortOrder: sortBy === 'name' || sortBy === 'type' ? 'asc' : 'desc',
  })

  const devices = data?.devices ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // ── Mutations ─────────────────────────────────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: async (params: { deviceId: string; name: string; buildingId: number }) => {
      await apiClient.put(`/api/devices/${params.deviceId}`, {
        name: params.name,
        building_id: params.buildingId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.devices() })
      notifySuccess('Qurilma biriktirildi')
      setDeviceToAssign(null)
    },
  })

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!deviceId.trim()) return
    setSubmitting(true)
    setAddError(null)
    try {
      await apiClient.post('/api/devices', {
        device_id: deviceId,
        name: name || null,
        utility_type: utilityType,
        firmware_mode: utilityType,
        meter_type: meterType || 'unknown',
        meter_serial: meterSerial || null,
        building_id: buildingId !== 'none' ? parseInt(buildingId) : null,
        is_active: true,
      })
      queryClient.invalidateQueries({ queryKey: qk.devices() })
      notifySuccess('Qurilma saqlandi', `${deviceId} ro'yxatdan o'tdi.`)
      setIsAddOpen(false)
      setDeviceId('')
      setName('')
      setUtilityType('electricity')
      setBuildingId('none')
      setMeterType('')
      setMeterSerial('')
    } catch (err) {
      setAddError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleExportCSV = () => {
    if (!devices.length) return
    downloadCsv(
      `devices_${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'Name', 'Utility', 'Status', 'Firmware', 'Building ID'],
      devices.map((d) => [
        d.id,
        d.name ?? '',
        d.utility_type,
        d.online ? 'online' : 'offline',
        d.fw_version ?? '',
        d.building_id ?? '',
      ]),
    )
    notifySuccess('CSV eksport qilindi', `${devices.length} ta qurilma (joriy sahifa)`)
  }

  const openAssign = (device: Device) => {
    setDeviceToAssign(device)
    setAssignName(device.meter_serial || device.name || device.id)
    setAssignBuildingId('none')
  }

  return (
    <div className="space-y-6">
      {/* ── Sahifa sarlavhasi ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Qurilmalar</h1>
          {total > 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">
              Jami <span className="font-medium text-foreground">{total}</span> ta qurilma
            </p>
          )}
        </div>
        {isAdmin && (
          <Button onClick={() => { setAddError(null); setIsAddOpen(true) }}>
            <Plus className="h-4 w-4" />
            Qurilma qo'shish
          </Button>
        )}
      </div>

      {/* ── Filtrlar ── */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Qurilma ID yoki nomini qidirish..."
              className="pl-9"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Tur" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha turlar</SelectItem>
              {UTILITY_OPTIONS.map((u) => (
                <SelectItem key={u.key} value={u.key}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Holat" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barchasi</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Saralash" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_seen">Saralash: oxirgi ko'rilgan</SelectItem>
              <SelectItem value="name">Saralash: nomi</SelectItem>
              <SelectItem value="type">Saralash: turi</SelectItem>
              <SelectItem value="status">Saralash: status</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleExportCSV} disabled={!devices.length}>
            <Download className="h-4 w-4" />
            CSV
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Ustunlar">
                <Columns3 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ustunlar</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {deviceTableColumns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={isColumnVisible(col.key)}
                  onCheckedChange={() => toggleColumn(col.key)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>

      {/* ── Jadval ── */}
      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : isError ? (
        <ErrorBlock message={getApiErrorMessage(queryError)} onRetry={() => refetch()} />
      ) : devices.length > 0 ? (
        <Card className={cn('overflow-hidden py-0 transition-opacity', isFetching && 'opacity-70')}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {isColumnVisible('status') && <TableHead className="w-24">Holat</TableHead>}
                  {isColumnVisible('id') && <TableHead>ID / nom</TableHead>}
                  {isColumnVisible('type') && <TableHead>Tur</TableHead>}
                  {isColumnVisible('firmware') && <TableHead>Firmware</TableHead>}
                  {isColumnVisible('actions') && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow
                    key={device.id}
                    className={cn(
                      device.building_id === null ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'cursor-pointer',
                    )}
                    onClick={() => device.building_id !== null && navigate(`/devices/${device.id}`)}
                  >
                    {isColumnVisible('status') && (
                      <TableCell>
                        <OnlineBadge online={device.online} />
                      </TableCell>
                    )}
                    {isColumnVisible('id') && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="font-medium hover:underline"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/devices/${device.id}`)
                            }}
                          >
                            {device.name ?? device.id}
                          </button>
                          {device.building_id === null && (
                            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                              yangi
                            </Badge>
                          )}
                          {device.is_test_device && <Badge variant="secondary">test</Badge>}
                          {device.needs_rebind && (
                            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                              qayta biriktirish
                            </Badge>
                          )}
                        </div>
                        {device.meter_serial && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{device.meter_serial}</p>
                        )}
                      </TableCell>
                    )}
                    {isColumnVisible('type') && (
                      <TableCell>
                        <Badge variant="secondary">{utilityLabel(device.utility_type)}</Badge>
                      </TableCell>
                    )}
                    {isColumnVisible('firmware') && (
                      <TableCell className="font-mono text-muted-foreground">{device.fw_version ?? '—'}</TableCell>
                    )}
                    {isColumnVisible('actions') && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Amallar">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/devices/${device.id}`)}>
                              Batafsil ko'rish
                            </DropdownMenuItem>
                            {device.building_id === null && !device.is_test_device && isAdmin && (
                              <DropdownMenuItem onClick={() => openAssign(device)}>
                                <Link2 className="h-4 w-4" />
                                Binoga biriktirish
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border px-4 py-3">
            <Pagination
              page={page}
              pages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </Card>
      ) : (
        <EmptyBlock title="Ma'lumot yo'q" message="Ushbu filtrga mos keluvchi qurilmalar topilmadi" />
      )}

      {/* ── Binoga biriktirish dialogi ── */}
      <Dialog open={deviceToAssign !== null} onOpenChange={(open) => !open && setDeviceToAssign(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Binoga biriktirish</DialogTitle>
            <DialogDescription>Yangi qurilmani nomlab, binoga biriktiring.</DialogDescription>
          </DialogHeader>
          {deviceToAssign && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">ID:</span> {deviceToAssign.id}
                </p>
                {deviceToAssign.meter_serial && (
                  <p>
                    <span className="font-medium text-foreground">Serial:</span> {deviceToAssign.meter_serial}
                  </p>
                )}
                <p>
                  <span className="font-medium text-foreground">Tur:</span>{' '}
                  {deviceToAssign.meter_type || utilityLabel(deviceToAssign.utility_type)}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign-name">Qurilma nomi</Label>
                <Input
                  id="assign-name"
                  value={assignName}
                  onChange={(e) => setAssignName(e.target.value)}
                  placeholder="Masalan: 3-qavat, 12-xona"
                />
              </div>
              <div className="space-y-2">
                <Label>Bino</Label>
                <Select value={assignBuildingId} onValueChange={setAssignBuildingId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="— Binoni tanlang —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Binoni tanlang —</SelectItem>
                    {buildings?.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {assignMutation.isError && (
                <p className="text-xs text-red-500">{getApiErrorMessage(assignMutation.error)}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceToAssign(null)}>
              Bekor
            </Button>
            <Button
              disabled={assignBuildingId === 'none' || !assignName.trim() || assignMutation.isPending}
              onClick={() => {
                if (!deviceToAssign || assignBuildingId === 'none' || !assignName.trim()) return
                assignMutation.mutate({
                  deviceId: deviceToAssign.id,
                  name: assignName.trim(),
                  buildingId: Number(assignBuildingId),
                })
              }}
            >
              {assignMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Qurilma qo'shish dialogi ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Qurilma qo'shish</DialogTitle>
            <DialogDescription>Yangi ESP32 qurilmani ro'yxatdan o'tkazish.</DialogDescription>
          </DialogHeader>
          {addError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
              {addError}
            </div>
          )}
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-device-id">Qurilma IDsi *</Label>
              <Input
                id="add-device-id"
                required
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="Masalan: esp32-meter-01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-name">Qurilma nomi</Label>
              <Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masalan: 1-qavat datchik"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Turi</Label>
                <Select value={utilityType} onValueChange={setUtilityType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UTILITY_OPTIONS.map((u) => (
                      <SelectItem key={u.key} value={u.key}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bino</Label>
                <Select value={buildingId} onValueChange={setBuildingId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Bino tanlang (ixtiyoriy)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Bino tanlanmagan</SelectItem>
                    {buildings?.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-meter-type">Hisoblagich turi</Label>
                <Input
                  id="add-meter-type"
                  value={meterType}
                  onChange={(e) => setMeterType(e.target.value)}
                  placeholder="Masalan: TE71 (ixtiyoriy)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-meter-serial">Serial raqami</Label>
                <Input
                  id="add-meter-serial"
                  value={meterSerial}
                  onChange={(e) => setMeterSerial(e.target.value)}
                  placeholder="Masalan: SN-12345"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
