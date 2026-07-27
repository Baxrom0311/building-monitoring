import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ArrowRight,
  Building2,
  DoorOpen,
  Download,
  Layers,
  LayoutGrid,
  MapPin,
  Plus,
  Search,
  Settings2,
  Table2,
} from 'lucide-react'
import { useBuildings, qk } from '@/hooks/queries'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import apiClient from '@/lib/api'
import { getApiErrorMessage } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/toast'
import type { Building } from '@/types/api'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/StateBlock'
import { Pagination } from '@/components/Pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

const PAGE_SIZE = 12

// ─── Bino holati ──────────────────────────────────────────────────────────────

type BuildingStatus = 'online' | 'offline' | 'unknown'

function getBuildingStatus(b: Building): BuildingStatus {
  if (!b.is_active) return 'offline'
  if (b.ext_sensor_online === true) return 'online'
  if (b.ext_sensor_online === false) return 'offline'
  return 'unknown'
}

const STATUS_DOT: Record<BuildingStatus, string> = {
  online: 'bg-emerald-500',
  unknown: 'bg-amber-500',
  offline: 'bg-red-500',
}

const STATUS_TEXT: Record<BuildingStatus, string> = {
  online: 'text-emerald-500',
  unknown: 'text-amber-500',
  offline: 'text-red-500',
}

const STATUS_LABEL: Record<BuildingStatus, string> = {
  online: 'Faol',
  unknown: 'Noaniq',
  offline: 'Nofaol',
}

const STATUS_HEX: Record<BuildingStatus, string> = {
  online: '#10b981',
  unknown: '#f59e0b',
  offline: '#ef4444',
}

// ─── Leaflet xarita (sahifa ichidagi kichik komponent) ───────────────────────

const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'

function dotIcon(color: string, selected: boolean): L.DivIcon {
  const size = selected ? 18 : 13
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function BuildingsMapView({
  buildings,
  selectedId,
  onSelect,
}: {
  buildings: Building[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const { isDark } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const layersRef = useRef<L.Layer[]>([])
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Xaritani bir marta ishga tushirish
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const center = buildings.find((b) => b.latitude != null && b.longitude != null)
    const map = L.map(containerRef.current, {
      center: center ? [center.latitude!, center.longitude!] : [41.55, 60.64],
      zoom: 13,
      zoomControl: true,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      tileRef.current = null
      layersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tile qatlamini tema bo'yicha almashtirish
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    tileRef.current?.remove()
    tileRef.current = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, {
      attribution: TILE_ATTR,
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
  }, [isDark])

  // Markerlar va poligonlarni yangilash
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.forEach((l) => l.remove())
    layersRef.current = []

    for (const b of buildings) {
      const status = getBuildingStatus(b)
      const color = STATUS_HEX[status]

      if (b.polygon_coordinate) {
        try {
          const coords = JSON.parse(b.polygon_coordinate)[0] as number[][]
          const positions = coords.map(([lat, lng]) => [lat, lng] as L.LatLngTuple)
          const poly = L.polygon(positions, {
            color,
            fillColor: color,
            fillOpacity: selectedId === b.id ? 0.35 : 0.15,
            weight: selectedId === b.id ? 3 : 2,
            opacity: 0.9,
          })
          poly.on('click', () => onSelectRef.current(b.id))
          poly.addTo(map)
          layersRef.current.push(poly)
        } catch {
          /* noto'g'ri polygon ma'lumoti — e'tiborsiz */
        }
      }

      if (b.latitude != null && b.longitude != null) {
        const popupHtml = `
          <div style="font-family:inherit;min-width:150px">
            <div style="font-weight:600;font-size:13px">${b.name}</div>
            ${b.address ? `<div style="font-size:11px;opacity:.7;margin-top:2px">${b.address}</div>` : ''}
            <div style="font-size:11px;opacity:.6;margin-top:4px;display:flex;gap:8px">
              <span>${b.floors} qavat</span><span>${b.entrances_count} kirish</span>
            </div>
            ${b.ext_sensor_temp_out != null ? `<div style="font-size:11px;opacity:.7;margin-top:3px">${b.ext_sensor_temp_out}°C</div>` : ''}
          </div>`
        const marker = L.marker([b.latitude, b.longitude], {
          icon: dotIcon(color, selectedId === b.id),
        }).bindPopup(popupHtml)
        marker.on('click', () => onSelectRef.current(b.id))
        marker.addTo(map)
        layersRef.current.push(marker)
      }
    }
  }, [buildings, selectedId])

  // Tanlangan binoga uchib borish
  useEffect(() => {
    if (!selectedId || !mapRef.current) return
    const b = buildings.find((x) => x.id === selectedId)
    if (b?.latitude != null && b.longitude != null) {
      mapRef.current.flyTo([b.latitude, b.longitude], Math.max(mapRef.current.getZoom(), 16), {
        duration: 0.8,
      })
    }
  }, [selectedId, buildings])

  return (
    <div className="relative h-[480px] w-full">
      <div ref={containerRef} className="absolute inset-0 z-0" />
    </div>
  )
}

// ─── Jadval ustunlari ─────────────────────────────────────────────────────────

const ALL_COLUMNS = [
  { key: 'name', label: 'Nomi' },
  { key: 'address', label: 'Manzil' },
  { key: 'organization', label: 'Tashkilot' },
  { key: 'status', label: 'Holat' },
  { key: 'floors', label: 'Qavatlar' },
  { key: 'entrances', label: 'Kirishlar' },
  { key: 'apartments', label: 'Xonadonlar' },
  { key: 'temp_out', label: 'Tashqi °C' },
  { key: 'temp_in', label: 'Ichki °C' },
  { key: 'mahalla', label: 'Mahalla' },
  { key: 'object_type', label: 'Tur' },
  { key: 'construction_year', label: 'Qurilgan yil' },
] as const

type ColKey = (typeof ALL_COLUMNS)[number]['key']

const DEFAULT_COLS = new Set<ColKey>([
  'name',
  'address',
  'organization',
  'status',
  'floors',
  'entrances',
  'temp_out',
])

// ─── Sahifa ───────────────────────────────────────────────────────────────────

export default function BuildingsPage() {
  const { data: buildings, isLoading, isError, error: queryError, refetch } = useBuildings()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedMapBuildingId, setSelectedMapBuildingId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(DEFAULT_COLS)

  // Yangi bino formasi
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [floors, setFloors] = useState(4)
  const [entrancesCount, setEntrancesCount] = useState(3)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const toggleCol = (key: ColKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleImportExternal = async () => {
    setImporting(true)
    try {
      const res = await apiClient.post<{ created: number; skipped: number; total: number }>(
        '/api/buildings/import-external',
      )
      queryClient.invalidateQueries({ queryKey: qk.buildings() })
      notifySuccess(
        'Import tugadi',
        `${res.data.created} ta yangi bino qo'shildi, ${res.data.skipped} ta o'tkazib yuborildi.`,
      )
    } catch (err) {
      notifyError('Import bajarilmadi', getApiErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setFormError(null)
    try {
      await apiClient.post('/api/buildings', {
        name,
        address: address || null,
        floors,
        entrances_count: entrancesCount,
        description: description || null,
      })
      queryClient.invalidateQueries({ queryKey: qk.buildings() })
      notifySuccess("Bino qo'shildi", `${name} muvaffaqiyatli yaratildi.`)
      setIsCreateOpen(false)
      setName('')
      setAddress('')
      setFloors(4)
      setEntrancesCount(3)
      setDescription('')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredBuildings = useMemo(() => {
    if (!buildings) return []
    const q = searchQuery.toLowerCase().trim()
    if (!q) return buildings
    return buildings.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.address ?? '').toLowerCase().includes(q) ||
        (b.organization_name ?? '').toLowerCase().includes(q) ||
        (b.mahalla_name ?? '').toLowerCase().includes(q) ||
        (b.description ?? '').toLowerCase().includes(q),
    )
  }, [buildings, searchQuery])

  const mappedCount = useMemo(
    () => filteredBuildings.filter((b) => b.latitude != null && b.longitude != null).length,
    [filteredBuildings],
  )

  const totalPages = Math.max(1, Math.ceil(filteredBuildings.length / PAGE_SIZE))
  const pagedBuildings = useMemo(
    () => filteredBuildings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredBuildings, page],
  )

  useEffect(() => {
    setPage(1)
  }, [searchQuery])

  return (
    <div className="space-y-6">
      {/* Sarlavha */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Binolar</h1>
          {buildings && <Badge variant="secondary">{buildings.length}</Badge>}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleImportExternal} disabled={importing}>
              <Download className="h-4 w-4" />
              {importing ? 'Import...' : 'Import'}
            </Button>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Yangi bino qo'shish
            </Button>
          </div>
        )}
      </div>

      {/* Filtr paneli */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nomi, manzil, tashkilot..."
              className="pl-8"
            />
          </div>

          <div className="flex items-center gap-1 rounded-md border p-1">
            <Button
              size="sm"
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              onClick={() => setViewMode('card')}
            >
              <LayoutGrid className="h-4 w-4" />
              Kartalar
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              onClick={() => setViewMode('table')}
            >
              <Table2 className="h-4 w-4" />
              Jadval
            </Button>
          </div>

          {viewMode === 'table' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="h-4 w-4" />
                  Ustunlar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Ko'rinadigan ustunlar</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_COLUMNS.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={visibleCols.has(col.key)}
                    onCheckedChange={() => toggleCol(col.key)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>{filteredBuildings.length} ta bino</span>
            {searchQuery && <Badge variant="outline">filtrlangan</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Xarita */}
      {buildings && buildings.length > 0 && (
        <Card className="overflow-hidden pb-0">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Binolar xaritasi
                <span className="text-xs font-normal text-muted-foreground">
                  {mappedCount} ta koordinatali
                </span>
              </CardTitle>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Faol
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Noaniq
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  Nofaol
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <BuildingsMapView
              buildings={filteredBuildings}
              selectedId={selectedMapBuildingId}
              onSelect={setSelectedMapBuildingId}
            />
          </CardContent>
        </Card>
      )}

      {/* Kontent */}
      {isLoading ? (
        <LoadingBlock title="Binolar yuklanmoqda" />
      ) : isError ? (
        <ErrorBlock message={getApiErrorMessage(queryError)} onRetry={() => refetch()} />
      ) : filteredBuildings.length === 0 ? (
        <EmptyBlock title="Ma'lumot topilmadi" message="Ushbu filtrga mos binolar topilmadi" />
      ) : viewMode === 'card' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pagedBuildings.map((building) => {
              const st = getBuildingStatus(building)
              return (
                <Link key={building.id} to={`/buildings/${building.id}`} className="group block">
                  <Card className="relative h-full gap-3 transition-colors hover:border-primary/40">
                    <span
                      className={`absolute right-4 top-4 h-2.5 w-2.5 rounded-full ${STATUS_DOT[st]}`}
                      title={STATUS_LABEL[st]}
                    />
                    <CardContent className="space-y-3">
                      <div className="flex items-start gap-3 pr-5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold leading-tight group-hover:text-primary">
                            {building.name}
                          </h3>
                          {building.address && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{building.address}</span>
                            </p>
                          )}
                          {building.organization_name && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {building.organization_name}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          <Layers className="h-3 w-3" />
                          {building.floors} qavat
                        </Badge>
                        <Badge variant="outline">
                          <DoorOpen className="h-3 w-3" />
                          {building.entrances_count} kirish
                        </Badge>
                        {building.ext_sensor_temp_out != null && (
                          <Badge variant="outline">{building.ext_sensor_temp_out}°C</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t pt-3">
                        <p className="flex-1 truncate text-xs italic text-muted-foreground">
                          {building.description || building.mahalla_name || 'Tavsif mavjud emas'}
                        </p>
                        <ArrowRight className="h-4 w-4 shrink-0 text-primary opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
          <Pagination
            page={page}
            pages={totalPages}
            total={filteredBuildings.length}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleCols.has('name') && <TableHead>Nomi</TableHead>}
                    {visibleCols.has('address') && <TableHead>Manzil</TableHead>}
                    {visibleCols.has('organization') && <TableHead>Tashkilot</TableHead>}
                    {visibleCols.has('status') && <TableHead>Holat</TableHead>}
                    {visibleCols.has('floors') && <TableHead className="text-center">Qavat</TableHead>}
                    {visibleCols.has('entrances') && (
                      <TableHead className="text-center">Kirish</TableHead>
                    )}
                    {visibleCols.has('apartments') && (
                      <TableHead className="text-center">Xonadon</TableHead>
                    )}
                    {visibleCols.has('temp_out') && (
                      <TableHead className="text-center">Tashqi °C</TableHead>
                    )}
                    {visibleCols.has('temp_in') && (
                      <TableHead className="text-center">Ichki °C</TableHead>
                    )}
                    {visibleCols.has('mahalla') && <TableHead>Mahalla</TableHead>}
                    {visibleCols.has('object_type') && <TableHead>Tur</TableHead>}
                    {visibleCols.has('construction_year') && (
                      <TableHead className="text-center">Yil</TableHead>
                    )}
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedBuildings.map((b) => {
                    const st = getBuildingStatus(b)
                    return (
                      <TableRow key={b.id} className="group">
                        {visibleCols.has('name') && (
                          <TableCell className="max-w-[200px] font-medium">
                            <span className="block truncate">{b.name}</span>
                          </TableCell>
                        )}
                        {visibleCols.has('address') && (
                          <TableCell className="max-w-[180px] text-muted-foreground">
                            <span className="block truncate">{b.address ?? '—'}</span>
                          </TableCell>
                        )}
                        {visibleCols.has('organization') && (
                          <TableCell className="text-muted-foreground">
                            {b.organization_name ?? '—'}
                          </TableCell>
                        )}
                        {visibleCols.has('status') && (
                          <TableCell>
                            <span
                              className={`flex items-center gap-1.5 text-xs font-medium ${STATUS_TEXT[st]}`}
                            >
                              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[st]}`} />
                              {STATUS_LABEL[st]}
                            </span>
                          </TableCell>
                        )}
                        {visibleCols.has('floors') && (
                          <TableCell className="text-center">{b.floors}</TableCell>
                        )}
                        {visibleCols.has('entrances') && (
                          <TableCell className="text-center">{b.entrances_count}</TableCell>
                        )}
                        {visibleCols.has('apartments') && (
                          <TableCell className="text-center text-muted-foreground">
                            {b.total_apartments ?? '—'}
                          </TableCell>
                        )}
                        {visibleCols.has('temp_out') && (
                          <TableCell className="text-center">
                            {b.ext_sensor_temp_out != null ? `${b.ext_sensor_temp_out}°` : '—'}
                          </TableCell>
                        )}
                        {visibleCols.has('temp_in') && (
                          <TableCell className="text-center">
                            {b.ext_sensor_temp_in != null ? `${b.ext_sensor_temp_in}°` : '—'}
                          </TableCell>
                        )}
                        {visibleCols.has('mahalla') && (
                          <TableCell className="text-muted-foreground">
                            {b.mahalla_name ?? '—'}
                          </TableCell>
                        )}
                        {visibleCols.has('object_type') && (
                          <TableCell className="text-muted-foreground">
                            {b.object_type ?? '—'}
                          </TableCell>
                        )}
                        {visibleCols.has('construction_year') && (
                          <TableCell className="text-center text-muted-foreground">
                            {b.construction_year ?? '—'}
                          </TableCell>
                        )}
                        <TableCell>
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100"
                          >
                            <Link to={`/buildings/${b.id}`}>
                              Ko'rish
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {filteredBuildings.length > PAGE_SIZE && (
              <div className="border-t px-4 py-3">
                <Pagination
                  page={page}
                  pages={totalPages}
                  total={filteredBuildings.length}
                  onPageChange={setPage}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Yangi bino dialogi */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi bino qo'shish</DialogTitle>
            <DialogDescription>Bino ma'lumotlarini kiriting.</DialogDescription>
          </DialogHeader>
          {formError && (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
              {formError}
            </p>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="building-name">Bino nomi *</Label>
              <Input
                id="building-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masalan: Bino A"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="building-address">Manzil</Label>
              <Input
                id="building-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ko'cha, uy raqami"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="building-floors">Qavatlar soni</Label>
                <Input
                  id="building-floors"
                  type="number"
                  min={1}
                  value={floors}
                  onChange={(e) => setFloors(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="building-entrances">Kirishlar soni</Label>
                <Input
                  id="building-entrances"
                  type="number"
                  min={1}
                  value={entrancesCount}
                  onChange={(e) => setEntrancesCount(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="building-description">Tavsif</Label>
              <Textarea
                id="building-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Qo'shimcha ma'lumotlar..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
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
