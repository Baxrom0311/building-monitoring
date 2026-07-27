import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileSpreadsheet, Loader2, Pencil, Plus, Search, Trash2, UploadCloud } from 'lucide-react'
import { useBuildings } from '@/hooks/queries'
import { useAuth } from '@/contexts/AuthContext'
import apiClient from '@/lib/api'
import { getApiErrorMessage } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/toast'
import { EmptyBlock, ErrorBlock, TableSkeleton } from '@/components/StateBlock'
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

// ─── Turlari ───────────────────────────────────────────────────────────────

interface MahallaRow {
  id: number
  name: string
  streets_count: number
}

interface StreetRow {
  id: number
  mahalla_id: number
  name: string
  mahalla_name: string
  buildings_count: number
}

interface ApartmentRow {
  id: number
  building_id: number
  apartment_no: string
  owner_name: string | null
  account_no: string | null
  cadastre_code: string | null
  contract_no: string | null
  contract_date: string | null
  pinfl: string | null
  phone: string | null
  people_count: number | null
  area_m2: number | null
  living_area_m2: number | null
  property_value: number | null
  rooms: number | null
  building_name: string
  street_id: number | null
  street_name: string | null
  mahalla_id: number | null
  mahalla_name: string | null
}

interface ApartmentForm {
  building_id: string
  apartment_no: string
  owner_name: string
  account_no: string
  cadastre_code: string
  contract_no: string
  contract_date: string
  pinfl: string
  phone: string
  people_count: string
  area_m2: string
  living_area_m2: string
  property_value: string
  rooms: string
}

const EMPTY_APARTMENT_FORM: ApartmentForm = {
  building_id: '', apartment_no: '', owner_name: '', account_no: '',
  cadastre_code: '', contract_no: '', contract_date: '', pinfl: '', phone: '',
  people_count: '', area_m2: '', living_area_m2: '', property_value: '', rooms: '',
}

async function downloadBlob(url: string, filename: string) {
  const { data } = await apiClient.get(url, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(blobUrl)
}

// ─── Sahifa ───────────────────────────────────────────────────────────────────

export default function TerritoryPage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['territory'] })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Xonadonlar</h1>
        <p className="text-sm text-muted-foreground">
          Mahalla, ko'cha va xonadonlarni boshqarish — qo'lda yoki Excel orqali
        </p>
      </div>

      <Tabs defaultValue="apartments">
        <TabsList>
          <TabsTrigger value="apartments">Xonadonlar</TabsTrigger>
          <TabsTrigger value="streets">Ko'chalar</TabsTrigger>
          <TabsTrigger value="mahallas">Mahallalar</TabsTrigger>
        </TabsList>

        <TabsContent value="apartments" className="mt-4">
          <ApartmentsTab isAdmin={isAdmin} onChanged={invalidateAll} />
        </TabsContent>
        <TabsContent value="streets" className="mt-4">
          <StreetsTab isAdmin={isAdmin} onChanged={invalidateAll} />
        </TabsContent>
        <TabsContent value="mahallas" className="mt-4">
          <MahallasTab isAdmin={isAdmin} onChanged={invalidateAll} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Mahallalar tab ───────────────────────────────────────────────────────────

function MahallasTab({ isAdmin, onChanged }: { isAdmin: boolean; onChanged: () => void }) {
  const {
    data, isLoading, isError, error, refetch,
  } = useQuery({
    queryKey: ['territory', 'mahallas'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ mahallas: MahallaRow[] }>('/api/territory/mahallas')
      return data.mahallas
    },
  })

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<MahallaRow | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MahallaRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setName('')
    setIsFormOpen(true)
  }
  const openEdit = (m: MahallaRow) => {
    setEditing(m)
    setName(m.name)
    setIsFormOpen(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await apiClient.put(`/api/territory/mahallas/${editing.id}`, { name: name.trim() })
        notifySuccess('Mahalla yangilandi')
      } else {
        await apiClient.post('/api/territory/mahallas', { name: name.trim() })
        notifySuccess('Mahalla qo\'shildi')
      }
      setIsFormOpen(false)
      refetch()
      onChanged()
    } catch (err) {
      notifyError('Saqlashda xatolik', getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiClient.delete(`/api/territory/mahallas/${deleteTarget.id}`)
      notifySuccess("Mahalla o'chirildi")
      setDeleteTarget(null)
      refetch()
      onChanged()
    } catch (err) {
      notifyError("O'chirishda xatolik", getApiErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Mahallalar ({data?.length ?? 0})</CardTitle>
          {isAdmin && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Mahalla qo'shish
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={5} /></div>
        ) : isError ? (
          <div className="p-4">
            <ErrorBlock title="Mahallalar olinmadi" message={getApiErrorMessage(error)} onRetry={() => refetch()} />
          </div>
        ) : data && data.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomi</TableHead>
                  <TableHead className="text-right">Ko'chalar soni</TableHead>
                  {isAdmin && <TableHead className="text-right">Amallar</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-right">{m.streets_count}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-500"
                          onClick={() => setDeleteTarget(m)}
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
        ) : (
          <div className="p-4">
            <EmptyBlock title="Mahalla yo'q" message="Hali birorta mahalla qo'shilmagan." />
          </div>
        )}
      </CardContent>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Mahallani tahrirlash' : 'Yangi mahalla'}</DialogTitle>
            <DialogDescription>Mahalla nomini kiriting.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mahalla-name">Nomi *</Label>
              <Input id="mahalla-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mahallani o'chirish</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" o'chiriladi. Agar unda ko'chalar bo'lsa, xatolik chiqadi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-red-500 text-white hover:bg-red-500/90"
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
            >
              {deleting ? "O'chirilmoqda..." : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// ─── Ko'chalar tab ────────────────────────────────────────────────────────────

function StreetsTab({ isAdmin, onChanged }: { isAdmin: boolean; onChanged: () => void }) {
  const { data: mahallas } = useQuery({
    queryKey: ['territory', 'mahallas'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ mahallas: MahallaRow[] }>('/api/territory/mahallas')
      return data.mahallas
    },
  })

  const [mahallaFilter, setMahallaFilter] = useState<string>('all')

  const {
    data, isLoading, isError, error, refetch,
  } = useQuery({
    queryKey: ['territory', 'streets', mahallaFilter],
    queryFn: async () => {
      const { data } = await apiClient.get<{ streets: StreetRow[] }>('/api/territory/streets', {
        params: mahallaFilter !== 'all' ? { mahalla_id: mahallaFilter } : {},
      })
      return data.streets
    },
  })

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<StreetRow | null>(null)
  const [name, setName] = useState('')
  const [formMahallaId, setFormMahallaId] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StreetRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setName('')
    setFormMahallaId(mahallas?.[0] ? String(mahallas[0].id) : '')
    setIsFormOpen(true)
  }
  const openEdit = (s: StreetRow) => {
    setEditing(s)
    setName(s.name)
    setFormMahallaId(String(s.mahalla_id))
    setIsFormOpen(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !formMahallaId) return
    setSaving(true)
    try {
      if (editing) {
        await apiClient.put(`/api/territory/streets/${editing.id}`, {
          name: name.trim(),
          mahalla_id: Number(formMahallaId),
        })
        notifySuccess("Ko'cha yangilandi")
      } else {
        await apiClient.post('/api/territory/streets', {
          mahalla_id: Number(formMahallaId),
          name: name.trim(),
        })
        notifySuccess("Ko'cha qo'shildi")
      }
      setIsFormOpen(false)
      refetch()
      onChanged()
    } catch (err) {
      notifyError('Saqlashda xatolik', getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiClient.delete(`/api/territory/streets/${deleteTarget.id}`)
      notifySuccess("Ko'cha o'chirildi")
      setDeleteTarget(null)
      refetch()
      onChanged()
    } catch (err) {
      notifyError("O'chirishda xatolik", getApiErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Ko'chalar ({data?.length ?? 0})</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={mahallaFilter} onValueChange={setMahallaFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Mahalla bo'yicha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha mahallalar</SelectItem>
                {(mahallas ?? []).map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button size="sm" onClick={openCreate} disabled={!mahallas || mahallas.length === 0}>
                <Plus className="h-4 w-4" />
                Ko'cha qo'shish
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={5} /></div>
        ) : isError ? (
          <div className="p-4">
            <ErrorBlock title="Ko'chalar olinmadi" message={getApiErrorMessage(error)} onRetry={() => refetch()} />
          </div>
        ) : data && data.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomi</TableHead>
                  <TableHead>Mahalla</TableHead>
                  <TableHead className="text-right">Binolar soni</TableHead>
                  {isAdmin && <TableHead className="text-right">Amallar</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.mahalla_name}</TableCell>
                    <TableCell className="text-right">{s.buildings_count}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-500"
                          onClick={() => setDeleteTarget(s)}
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
        ) : (
          <div className="p-4">
            <EmptyBlock title="Ko'cha yo'q" message="Hali birorta ko'cha qo'shilmagan." />
          </div>
        )}
      </CardContent>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Ko'chani tahrirlash" : "Yangi ko'cha"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Mahalla *</Label>
              <Select value={formMahallaId} onValueChange={setFormMahallaId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Mahalla tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {(mahallas ?? []).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="street-name">Ko'cha nomi *</Label>
              <Input id="street-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ko'chani o'chirish</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" o'chiriladi. Agar unda binolar bo'lsa, xatolik chiqadi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-red-500 text-white hover:bg-red-500/90"
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
            >
              {deleting ? "O'chirilmoqda..." : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// ─── Xonadonlar tab ───────────────────────────────────────────────────────────

function ApartmentsTab({ isAdmin, onChanged }: { isAdmin: boolean; onChanged: () => void }) {
  const { data: buildings } = useBuildings()
  const { data: mahallas } = useQuery({
    queryKey: ['territory', 'mahallas'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ mahallas: MahallaRow[] }>('/api/territory/mahallas')
      return data.mahallas
    },
  })
  const { data: streets } = useQuery({
    queryKey: ['territory', 'streets', 'all'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ streets: StreetRow[] }>('/api/territory/streets')
      return data.streets
    },
  })

  const [mahallaFilter, setMahallaFilter] = useState('all')
  const [streetFilter, setStreetFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25

  const filteredStreets = useMemo(
    () => (mahallaFilter === 'all' ? (streets ?? []) : (streets ?? []).filter((s) => String(s.mahalla_id) === mahallaFilter)),
    [streets, mahallaFilter],
  )

  const {
    data, isLoading, isError, error, refetch,
  } = useQuery({
    queryKey: ['territory', 'apartments', mahallaFilter, streetFilter, search, page],
    queryFn: async () => {
      const { data } = await apiClient.get<{ total: number; apartments: ApartmentRow[] }>(
        '/api/territory/apartments',
        {
          params: {
            page,
            limit,
            ...(mahallaFilter !== 'all' ? { mahalla_id: mahallaFilter } : {}),
            ...(streetFilter !== 'all' ? { street_id: streetFilter } : {}),
            ...(search.trim() ? { search: search.trim() } : {}),
          },
        },
      )
      return data
    },
  })

  // ── Qo'shish/tahrirlash ──
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<ApartmentRow | null>(null)
  const [form, setForm] = useState<ApartmentForm>(EMPTY_APARTMENT_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApartmentRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_APARTMENT_FORM, building_id: buildings?.[0] ? String(buildings[0].id) : '' })
    setIsFormOpen(true)
  }
  const openEdit = (a: ApartmentRow) => {
    setEditing(a)
    setForm({
      building_id: String(a.building_id),
      apartment_no: a.apartment_no,
      owner_name: a.owner_name ?? '',
      account_no: a.account_no ?? '',
      cadastre_code: a.cadastre_code ?? '',
      contract_no: a.contract_no ?? '',
      contract_date: a.contract_date ?? '',
      pinfl: a.pinfl ?? '',
      phone: a.phone ?? '',
      people_count: a.people_count != null ? String(a.people_count) : '',
      area_m2: a.area_m2 != null ? String(a.area_m2) : '',
      living_area_m2: a.living_area_m2 != null ? String(a.living_area_m2) : '',
      property_value: a.property_value != null ? String(a.property_value) : '',
      rooms: a.rooms != null ? String(a.rooms) : '',
    })
    setIsFormOpen(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.building_id || !form.apartment_no.trim()) return
    setSaving(true)
    const body = {
      building_id: Number(form.building_id),
      apartment_no: form.apartment_no.trim(),
      owner_name: form.owner_name || null,
      account_no: form.account_no || null,
      cadastre_code: form.cadastre_code || null,
      contract_no: form.contract_no || null,
      contract_date: form.contract_date || null,
      pinfl: form.pinfl || null,
      phone: form.phone || null,
      people_count: form.people_count ? Number(form.people_count) : null,
      area_m2: form.area_m2 ? Number(form.area_m2) : null,
      living_area_m2: form.living_area_m2 ? Number(form.living_area_m2) : null,
      property_value: form.property_value ? Number(form.property_value) : null,
      rooms: form.rooms ? Number(form.rooms) : null,
    }
    try {
      if (editing) {
        await apiClient.put(`/api/territory/apartments/${editing.id}`, body)
        notifySuccess('Xonadon yangilandi')
      } else {
        await apiClient.post('/api/territory/apartments', body)
        notifySuccess("Xonadon qo'shildi")
      }
      setIsFormOpen(false)
      refetch()
      onChanged()
    } catch (err) {
      notifyError('Saqlashda xatolik', getApiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiClient.delete(`/api/territory/apartments/${deleteTarget.id}`)
      notifySuccess("Xonadon o'chirildi")
      setDeleteTarget(null)
      refetch()
      onChanged()
    } catch (err) {
      notifyError("O'chirishda xatolik", getApiErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  // ── Excel import ──
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)

  const handleImport = async (e: FormEvent) => {
    e.preventDefault()
    if (!importFile) return
    setImporting(true)
    const formData = new FormData()
    formData.append('file', importFile)
    try {
      const { data } = await apiClient.post('/api/territory/apartments/import', formData)
      notifySuccess(
        'Import bajarildi',
        `${data.rows_imported} / ${data.rows_total} qator import qilindi, ${data.buildings_created} ta yangi bino yaratildi.`,
      )
      setImportFile(null)
      setFileInputKey((k) => k + 1)
      refetch()
      onChanged()
    } catch (err) {
      notifyError('Import xatoligi', getApiErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const handleTemplateDownload = async () => {
    setDownloadingTemplate(true)
    try {
      await downloadBlob('/api/territory/apartments/template', 'xonadonlar_shablon.xlsx')
    } catch (err) {
      notifyError("Shablonni yuklab bo'lmadi", getApiErrorMessage(err))
    } finally {
      setDownloadingTemplate(false)
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              Excel orqali ommaviy qo'shish
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleImport} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px] space-y-2">
                <Label htmlFor="apt-import-file">Fayl (.xlsx)</Label>
                <Input
                  key={fileInputKey}
                  id="apt-import-file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" disabled={!importFile || importing}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {importing ? 'Yuklanmoqda...' : 'Import qilish'}
              </Button>
              <Button type="button" variant="outline" onClick={handleTemplateDownload} disabled={downloadingTemplate}>
                <Download className="h-4 w-4" />
                Shablon yuklab olish
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="gap-4">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Xonadonlar ({data?.total ?? 0})</CardTitle>
            {isAdmin && (
              <Button size="sm" onClick={openCreate} disabled={!buildings || buildings.length === 0}>
                <Plus className="h-4 w-4" />
                Xonadon qo'shish
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select value={mahallaFilter} onValueChange={(v) => { setMahallaFilter(v); setStreetFilter('all'); setPage(1) }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Mahalla" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha mahallalar</SelectItem>
                {(mahallas ?? []).map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={streetFilter} onValueChange={(v) => { setStreetFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Ko'cha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha ko'chalar</SelectItem>
                {filteredStreets.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Egasi, xonadon yoki hisob raqami..."
                className="pl-8"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} /></div>
          ) : isError ? (
            <div className="p-4">
              <ErrorBlock title="Xonadonlar olinmadi" message={getApiErrorMessage(error)} onRetry={() => refetch()} />
            </div>
          ) : data && data.apartments.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bino</TableHead>
                      <TableHead>Xonadon</TableHead>
                      <TableHead>Egasi</TableHead>
                      <TableHead>Hisob raqami</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead className="text-right">Odam</TableHead>
                      {isAdmin && <TableHead className="text-right">Amallar</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.apartments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.building_name}
                          {a.mahalla_name && (
                            <p className="text-xs font-normal text-muted-foreground">
                              {a.mahalla_name}{a.street_name ? `, ${a.street_name}` : ''}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.apartment_no}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{a.owner_name ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{a.account_no ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{a.phone ?? '—'}</TableCell>
                        <TableCell className="text-right">{a.people_count ?? '—'}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-500"
                              onClick={() => setDeleteTarget(a)}
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
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
                  <span>{page} / {totalPages} sahifa</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Oldingi
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Keyingi
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-4">
              <EmptyBlock title="Xonadon topilmadi" message="Filtrga mos xonadon yo'q yoki hali qo'shilmagan." />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Xonadonni tahrirlash' : 'Yangi xonadon'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Bino *</Label>
                <Select value={form.building_id} onValueChange={(v) => setForm((f) => ({ ...f, building_id: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Bino tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {(buildings ?? []).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-no">Xonadon raqami *</Label>
                <Input id="apt-no" required value={form.apartment_no}
                  onChange={(e) => setForm((f) => ({ ...f, apartment_no: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-owner">Egasi (F.I.O)</Label>
                <Input id="apt-owner" value={form.owner_name}
                  onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-account">Hisob raqami</Label>
                <Input id="apt-account" value={form.account_no}
                  onChange={(e) => setForm((f) => ({ ...f, account_no: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-phone">Telefon</Label>
                <Input id="apt-phone" value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-pinfl">PINFL</Label>
                <Input id="apt-pinfl" value={form.pinfl}
                  onChange={(e) => setForm((f) => ({ ...f, pinfl: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-cadastre">Kadastr kodi</Label>
                <Input id="apt-cadastre" value={form.cadastre_code}
                  onChange={(e) => setForm((f) => ({ ...f, cadastre_code: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-contract-no">Shartnoma raqami</Label>
                <Input id="apt-contract-no" value={form.contract_no}
                  onChange={(e) => setForm((f) => ({ ...f, contract_no: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-contract-date">Shartnoma sanasi</Label>
                <Input id="apt-contract-date" value={form.contract_date}
                  onChange={(e) => setForm((f) => ({ ...f, contract_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-people">Odamlar soni</Label>
                <Input id="apt-people" type="number" min={0} value={form.people_count}
                  onChange={(e) => setForm((f) => ({ ...f, people_count: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-rooms">Xonalar soni</Label>
                <Input id="apt-rooms" type="number" min={0} value={form.rooms}
                  onChange={(e) => setForm((f) => ({ ...f, rooms: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-area">Umumiy maydon (m2)</Label>
                <Input id="apt-area" type="number" step="0.1" min={0} value={form.area_m2}
                  onChange={(e) => setForm((f) => ({ ...f, area_m2: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apt-living-area">Yashash maydoni (m2)</Label>
                <Input id="apt-living-area" type="number" step="0.1" min={0} value={form.living_area_m2}
                  onChange={(e) => setForm((f) => ({ ...f, living_area_m2: e.target.value }))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="apt-value">Kadastr qiymati (so'm)</Label>
                <Input id="apt-value" type="number" step="0.01" min={0} value={form.property_value}
                  onChange={(e) => setForm((f) => ({ ...f, property_value: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xonadonni o'chirish</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.building_name} — {deleteTarget?.apartment_no}" o'chiriladi. Agar unga bog'liq
              kommunal hisobotlar bo'lsa, xatolik chiqadi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-red-500 text-white hover:bg-red-500/90"
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
            >
              {deleting ? "O'chirilmoqda..." : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
