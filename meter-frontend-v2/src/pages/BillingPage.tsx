import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileSpreadsheet, Loader2, Search, UploadCloud } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import apiClient from '@/lib/api'
import { getApiErrorMessage } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/toast'
import { EmptyBlock, ErrorBlock, TableSkeleton } from '@/components/StateBlock'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

// ─── API turlari ──────────────────────────────────────────────────────────────

type UtilityType = 'water' | 'gas' | 'electricity'

interface BillingPeriod {
  period: string // '2026-07'
  utility_type: UtilityType
}

interface PeriodsResponse {
  periods: BillingPeriod[]
}

interface SummaryBuilding {
  building_id: number
  utility_type: UtilityType
  building_name: string
  house_no: string | null
  mahalla_name: string | null
  street_name: string | null
  apartments: number
  volume: number | null
  accrued: number | null
  paid: number | null
  debt: number | null
}

interface SummaryResponse {
  period: string
  total: number
  buildings: SummaryBuilding[]
}

interface TopConsumer {
  volume: number | null
  accrued: number | null
  paid: number | null
  debt: number | null
  apartment_no: string | null
  owner_name: string | null
  account_no: string | null
  building_id: number
  building_name: string
}

interface TopResponse {
  period: string
  utility_type: UtilityType
  top: TopConsumer[]
}

interface BillingImport {
  id: number
  filename: string
  utility_type: UtilityType
  period: number // 202607
  fmt: string
  rows_total: number
  rows_imported: number
  buildings_created: number
  created_by_username: string | null
  created_at: number // unix sec
}

interface ImportsResponse {
  imports: BillingImport[]
}

interface ImportResult {
  ok: boolean
  format: string
  rows_total: number
  rows_imported: number
  buildings_created: number
  import_id: number
}

// ─── Yordamchilar ─────────────────────────────────────────────────────────────

const UTILITY_LABELS: Record<UtilityType, string> = {
  water: 'Suv',
  gas: 'Gaz',
  electricity: 'Elektr',
}

function utilityBadge(utility: UtilityType | string) {
  if (utility === 'water')
    return (
      <Badge variant="outline" className="border-cyan-500/30 text-cyan-500">
        Suv
      </Badge>
    )
  if (utility === 'gas')
    return (
      <Badge variant="outline" className="border-orange-500/30 text-orange-500">
        Gaz
      </Badge>
    )
  if (utility === 'electricity')
    return (
      <Badge variant="outline" className="border-yellow-500/30 text-yellow-500">
        Elektr
      </Badge>
    )
  return <Badge variant="outline">{utility}</Badge>
}

function volumeUnit(utility: UtilityType | string): string {
  return utility === 'electricity' ? 'kWh' : 'm³'
}

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('uz-UZ', { maximumFractionDigits: 2 })
}

function fmtMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toLocaleString('uz-UZ', { maximumFractionDigits: 0 })} so'm`
}

// 202607 → '2026-07'
function fmtPeriodNum(period: number): string {
  const s = String(period)
  if (s.length !== 6) return s
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

// ─── Sahifa ───────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { user, isAdmin } = useAuth()
  const queryClient = useQueryClient()

  // /billing/:utility — kommunal turga bog'langan sahifa (suv/gaz/elektr)
  const { utility: utilityParam } = useParams<{ utility?: string }>()
  const fixedUtility: UtilityType | null =
    utilityParam === 'water' || utilityParam === 'gas' || utilityParam === 'electricity'
      ? utilityParam
      : null

  // Kommunal idora operatori faqat o'z sahifasida yuklay oladi
  const canUpload =
    isAdmin || (fixedUtility !== null && user?.role === `${fixedUtility}_org`)

  // ── Filtrlar ──
  const [period, setPeriod] = useState('')
  const [utility, setUtility] = useState<'all' | UtilityType>(fixedUtility ?? 'all')

  // Sahifalar orasida o'tganda (komponent qayta ishlatiladi) filtrni sinxronlash
  useEffect(() => {
    setUtility(fixedUtility ?? 'all')
    setUploadUtility(fixedUtility ?? 'water')
  }, [fixedUtility])
  const [summarySearch, setSummarySearch] = useState('')
  const [topLimit, setTopLimit] = useState('20')

  // ── Davrlar ──
  const {
    data: periodsData,
    isLoading: periodsLoading,
    isError: periodsIsError,
    error: periodsError,
    refetch: refetchPeriods,
  } = useQuery({
    queryKey: ['billing', 'periods'],
    queryFn: async () => {
      const { data } = await apiClient.get<PeriodsResponse>('/api/billing/periods')
      return data
    },
  })

  const periodOptions = useMemo(() => {
    const unique = new Set((periodsData?.periods ?? []).map((p) => p.period))
    return Array.from(unique).sort((a, b) => b.localeCompare(a))
  }, [periodsData])

  // Standart davr — eng oxirgisi
  useEffect(() => {
    if (!period && periodOptions.length > 0) {
      setPeriod(periodOptions[0])
    }
  }, [period, periodOptions])

  // ── Domlar kesimida ──
  const {
    data: summaryData,
    isLoading: summaryLoading,
    isError: summaryIsError,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['billing', 'summary', period, utility],
    queryFn: async () => {
      const { data } = await apiClient.get<SummaryResponse>('/api/billing/summary', {
        params: {
          period,
          ...(utility !== 'all' ? { utility_type: utility } : {}),
        },
      })
      return data
    },
    enabled: period !== '',
  })

  const filteredBuildings = useMemo(() => {
    const rows = summaryData?.buildings ?? []
    const q = summarySearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (b) =>
        b.building_name.toLowerCase().includes(q) ||
        (b.mahalla_name ?? '').toLowerCase().includes(q),
    )
  }, [summaryData, summarySearch])

  // ── Top iste'molchilar ──
  const {
    data: topData,
    isLoading: topLoading,
    isError: topIsError,
    error: topError,
    refetch: refetchTop,
  } = useQuery({
    queryKey: ['billing', 'top', period, utility, topLimit],
    queryFn: async () => {
      const { data } = await apiClient.get<TopResponse>('/api/billing/top', {
        params: { period, utility_type: utility, limit: Number(topLimit) },
      })
      return data
    },
    enabled: period !== '' && utility !== 'all',
  })

  // ── Yuklashlar tarixi ──
  const {
    data: importsData,
    isLoading: importsLoading,
    isError: importsIsError,
    error: importsError,
    refetch: refetchImports,
  } = useQuery({
    queryKey: ['billing', 'imports'],
    queryFn: async () => {
      const { data } = await apiClient.get<ImportsResponse>('/api/billing/imports', {
        params: { limit: 50 },
      })
      return data
    },
  })

  const allImports = importsData?.imports ?? []
  const imports = fixedUtility
    ? allImports.filter((i) => i.utility_type === fixedUtility)
    : allImports

  // ── Yuklash formasi ──
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadUtility, setUploadUtility] = useState<UtilityType>('water')
  const [uploadPeriod, setUploadPeriod] = useState('')
  const [uploadMahalla, setUploadMahalla] = useState('')
  const [uploading, setUploading] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!uploadFile || !uploadPeriod) return
    setUploading(true)

    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('utility_type', uploadUtility)
    formData.append('period', uploadPeriod)
    if (uploadMahalla.trim()) formData.append('only_mahalla', uploadMahalla.trim())

    try {
      const { data } = await apiClient.post<ImportResult>('/api/billing/import', formData)
      notifySuccess(
        'Hisobot yuklandi',
        `${data.rows_imported} / ${data.rows_total} qator import qilindi, ${data.buildings_created} ta yangi bino yaratildi.`,
      )
      setUploadFile(null)
      setUploadMahalla('')
      setFileInputKey((k) => k + 1)
      queryClient.invalidateQueries({ queryKey: ['billing'] })
    } catch (err) {
      notifyError('Hisobot yuklanmadi', getApiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const handleTemplateDownload = async () => {
    setDownloadingTemplate(true)
    try {
      const { data } = await apiClient.get('/api/billing/template', {
        params: { utility_type: uploadUtility },
        responseType: 'blob',
      })
      const blobUrl = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${uploadUtility}_shablon.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      notifyError("Shablonni yuklab bo'lmadi", getApiErrorMessage(err))
    } finally {
      setDownloadingTemplate(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Sarlavha */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {fixedUtility ? `${UTILITY_LABELS[fixedUtility]} hisobotlari` : 'Kommunal hisobotlar'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {fixedUtility
              ? `${UTILITY_LABELS[fixedUtility]} idorasi Excel hisobotlari — domlar kesimida sarflar tahlili.`
              : "Suv, gaz va elektr idoralari Excel hisobotlari — domlar kesimida sarflar tahlili."}
          </p>
        </div>
      </div>

      {/* Filtrlar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="space-y-1.5">
            <Label>Davr</Label>
            <Select value={period} onValueChange={setPeriod} disabled={periodOptions.length === 0}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={periodsLoading ? 'Yuklanmoqda...' : 'Davr tanlang'} />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fixedUtility === null && (
          <div className="space-y-1.5">
            <Label>Kommunal turi</Label>
            <Select value={utility} onValueChange={(v) => setUtility(v as 'all' | UtilityType)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                <SelectItem value="water">Suv</SelectItem>
                <SelectItem value="gas">Gaz</SelectItem>
                <SelectItem value="electricity">Elektr</SelectItem>
              </SelectContent>
            </Select>
          </div>
          )}
          {periodsIsError && (
            <span className="text-sm text-red-500">
              Davrlar yuklanmadi: {getApiErrorMessage(periodsError)}{' '}
              <Button variant="outline" size="sm" onClick={() => refetchPeriods()}>
                Qayta urinish
              </Button>
            </span>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Domlar kesimida</TabsTrigger>
          <TabsTrigger value="top">Top iste'molchilar</TabsTrigger>
          <TabsTrigger value="imports">Yuklashlar</TabsTrigger>
        </TabsList>

        {/* ─── Domlar kesimida ─── */}
        <TabsContent value="summary" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={summarySearch}
                  onChange={(e) => setSummarySearch(e.target.value)}
                  placeholder="Bino yoki mahalla nomi bo'yicha qidirish..."
                  className="pl-8"
                />
              </div>
              <Badge variant="secondary">{filteredBuildings.length} ta bino</Badge>
            </CardContent>
          </Card>

          {summaryLoading || (periodsLoading && !period) ? (
            <TableSkeleton rows={6} />
          ) : summaryIsError ? (
            <ErrorBlock
              message={getApiErrorMessage(summaryError)}
              onRetry={() => refetchSummary()}
            />
          ) : filteredBuildings.length > 0 ? (
            <Card className="py-0">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bino</TableHead>
                        <TableHead>Turi</TableHead>
                        <TableHead className="text-right">Xonadonlar</TableHead>
                        <TableHead className="text-right">Hajm</TableHead>
                        <TableHead className="text-right">Hisoblangan</TableHead>
                        <TableHead className="text-right">To'langan</TableHead>
                        <TableHead className="text-right">Qarz</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBuildings.map((b) => (
                        <TableRow key={`${b.building_id}-${b.utility_type}`}>
                          <TableCell>
                            <p className="font-medium">{b.building_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {[b.mahalla_name, b.street_name, b.house_no]
                                .filter(Boolean)
                                .join(', ') || '—'}
                            </p>
                          </TableCell>
                          <TableCell>{utilityBadge(b.utility_type)}</TableCell>
                          <TableCell className="text-right">{b.apartments}</TableCell>
                          <TableCell className="text-right font-mono">
                            {b.volume !== null
                              ? `${fmtNumber(b.volume)} ${volumeUnit(b.utility_type)}`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtMoney(b.accrued)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtMoney(b.paid)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono ${
                              (b.debt ?? 0) > 0 ? 'text-red-500' : ''
                            }`}
                          >
                            {fmtMoney(b.debt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyBlock
              title="Hisobot yuklanmagan"
              message="Tanlangan davr va tur bo'yicha ma'lumot topilmadi. Excel hisobotini yuklang."
            />
          )}
        </TabsContent>

        {/* ─── Top iste'molchilar ─── */}
        <TabsContent value="top" className="mt-4 space-y-4">
          {utility === 'all' ? (
            <EmptyBlock
              title="Kommunal turini tanlang"
              message="Top iste'molchilar ro'yxati uchun yuqoridagi filtrdan aniq turni (Suv, Gaz yoki Elektr) tanlang."
            />
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="space-y-1.5">
                    <Label>Nechta ko'rsatish</Label>
                    <Select value={topLimit} onValueChange={setTopLimit}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {UTILITY_LABELS[utility]} — {period || '—'} davri bo'yicha eng ko'p sarflaganlar
                  </span>
                </CardContent>
              </Card>

              {topLoading ? (
                <TableSkeleton rows={6} />
              ) : topIsError ? (
                <ErrorBlock message={getApiErrorMessage(topError)} onRetry={() => refetchTop()} />
              ) : (topData?.top.length ?? 0) > 0 ? (
                <Card className="py-0">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">№</TableHead>
                            <TableHead>Bino</TableHead>
                            <TableHead>Xonadon</TableHead>
                            <TableHead>Egasi</TableHead>
                            <TableHead className="text-right">Hajm</TableHead>
                            <TableHead className="text-right">Qarz</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(topData?.top ?? []).map((row, index) => (
                            <TableRow key={`${row.building_id}-${row.account_no ?? index}`}>
                              <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                              <TableCell className="font-medium">{row.building_name}</TableCell>
                              <TableCell>
                                <p>{row.apartment_no ?? '—'}</p>
                                {row.account_no && (
                                  <p className="font-mono text-xs text-muted-foreground">
                                    {row.account_no}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {row.owner_name ?? '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {row.volume !== null
                                  ? `${fmtNumber(row.volume)} ${volumeUnit(utility)}`
                                  : '—'}
                              </TableCell>
                              <TableCell
                                className={`text-right font-mono ${
                                  (row.debt ?? 0) > 0 ? 'text-red-500' : ''
                                }`}
                              >
                                {fmtMoney(row.debt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <EmptyBlock
                  title="Hisobot yuklanmagan"
                  message="Tanlangan davr va tur bo'yicha iste'molchilar topilmadi."
                />
              )}
            </>
          )}
        </TabsContent>

        {/* ─── Yuklashlar ─── */}
        <TabsContent value="imports" className="mt-4 space-y-4">
          {canUpload && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel hisobot yuklash
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpload} className="space-y-4 text-sm">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="billing-file">Excel fayl (.xlsx) *</Label>
                      <Input
                        key={fileInputKey}
                        id="billing-file"
                        type="file"
                        required
                        accept=".xlsx"
                        onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Kommunal turi *</Label>
                      <Select
                        value={uploadUtility}
                        onValueChange={(v) => setUploadUtility(v as UtilityType)}
                        disabled={fixedUtility !== null}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="water">Suv</SelectItem>
                          <SelectItem value="gas">Gaz</SelectItem>
                          <SelectItem value="electricity">Elektr</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="billing-period">Davr *</Label>
                      <Input
                        id="billing-period"
                        type="month"
                        required
                        value={uploadPeriod}
                        onChange={(e) => setUploadPeriod(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="billing-mahalla">Faqat mahalla</Label>
                      <Input
                        id="billing-mahalla"
                        value={uploadMahalla}
                        onChange={(e) => setUploadMahalla(e.target.value)}
                        placeholder="Ixtiyoriy filtr"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={uploading || !uploadFile || !uploadPeriod}>
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="h-4 w-4" />
                      )}
                      {uploading ? 'Yuklanmoqda...' : 'Yuklash'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={downloadingTemplate}
                      onClick={handleTemplateDownload}
                    >
                      <Download className="h-4 w-4" />
                      Shablon yuklab olish
                    </Button>
                    {uploading && (
                      <span className="text-xs text-muted-foreground">
                        Katta fayllar uchun bu bir necha o'n soniya davom etishi mumkin.
                      </span>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {importsLoading ? (
            <TableSkeleton rows={6} />
          ) : importsIsError ? (
            <ErrorBlock
              message={getApiErrorMessage(importsError)}
              onRetry={() => refetchImports()}
            />
          ) : imports.length > 0 ? (
            <Card className="py-0">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fayl</TableHead>
                        <TableHead>Turi</TableHead>
                        <TableHead>Davr</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead className="text-right">Qatorlar</TableHead>
                        <TableHead className="text-right">Yangi binolar</TableHead>
                        <TableHead>Kim</TableHead>
                        <TableHead>Qachon</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {imports.map((imp) => (
                        <TableRow key={imp.id}>
                          <TableCell className="max-w-64 truncate font-medium">
                            {imp.filename}
                          </TableCell>
                          <TableCell>{utilityBadge(imp.utility_type)}</TableCell>
                          <TableCell className="font-mono">{fmtPeriodNum(imp.period)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-muted-foreground">
                              {imp.fmt}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {imp.rows_imported} / {imp.rows_total}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {imp.buildings_created}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {imp.created_by_username ?? '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(imp.created_at * 1000).toLocaleString('uz-UZ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyBlock
              title="Hisobot yuklanmagan"
              message="Hozircha birorta ham Excel hisoboti import qilinmagan."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
