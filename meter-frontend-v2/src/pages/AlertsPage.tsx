import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Check, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react'
import { useAlertsList, useAlertRules, useBuildings, qk } from '@/hooks/queries'
import { useAuth } from '@/contexts/AuthContext'
import { translations } from '@/i18n/translations'
import apiClient from '@/lib/api'
import { getApiErrorMessage } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/toast'
import type { Alert, AlertRule } from '@/types/api'
import { EmptyBlock, ErrorBlock, TableSkeleton } from '@/components/StateBlock'
import { Pagination } from '@/components/Pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ─── Yordamchilar ─────────────────────────────────────────────────────────────

type ConfirmAction = { type: 'clear-all' } | { type: 'delete-rule'; id: number }

const alertRuleOptions = {
  electricity: [
    { value: 'overvoltage', label: 'Yuqori kuchlanish' },
    { value: 'undervoltage', label: 'Past kuchlanish' },
    { value: 'frequency', label: 'Chastota normadan tashqari' },
  ],
  water: [
    { value: 'water_low_pressure', label: 'Suv bosimi past' },
    { value: 'water_not_reaching_top', label: 'Yuqori qavatga suv chiqmayapti' },
  ],
  gas: [
    { value: 'gas_pressure', label: 'Gaz bosimi normadan tashqari' },
  ],
  soil: [
    { value: 'soil_dry', label: 'Tuproq qurib qoldi' },
    { value: 'soil_wet', label: 'Tuproq haddan tashqari nam' },
  ],
  sound: [
    { value: 'sound_high_level', label: 'Ovoz darajasi yuqori' },
    { value: 'sound_low_level', label: 'Ovoz darajasi past' },
  ],
} as const

type UtilityType = keyof typeof alertRuleOptions

function utilityLabel(utility: string | null): string {
  if (!utility) return 'Barchasi'
  return (
    translations.deviceTypes[utility as keyof typeof translations.deviceTypes] ?? utility
  )
}

function SeverityBadge({ severity }: { severity: Alert['severity'] | string }) {
  if (severity === 'critical') {
    return (
      <Badge className="border-red-500/20 bg-red-500/10 text-red-500">
        {translations.alerts.critical}
      </Badge>
    )
  }
  if (severity === 'warning') {
    return (
      <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-500">
        {translations.alerts.warning}
      </Badge>
    )
  }
  return <Badge variant="secondary">{translations.alerts.info}</Badge>
}

function thresholdText(rule: AlertRule): string {
  const parts: string[] = []
  if (rule.min_value !== null) parts.push(`>= ${rule.min_value}`)
  if (rule.max_value !== null) parts.push(`<= ${rule.max_value}`)
  return parts.length > 0 ? parts.join(' va ') : '—'
}

const PAGE_SIZE_DEFAULT = 20

// ─── Sahifa ───────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'history' | 'rules'>('history')

  // ── Jurnal: server tomonida sahifalash va filtrlar ──
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'cleared'>('all')
  const [kindInput, setKindInput] = useState('')
  const [deviceInput, setDeviceInput] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('')

  // Matnli filtrlash uchun kichik debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setKindFilter(kindInput.trim())
      setDeviceFilter(deviceInput.trim())
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [kindInput, deviceInput])

  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  const {
    data: alertsData,
    isLoading: alertsLoading,
    isError: alertsIsError,
    error: alertsQueryError,
    refetch: refetchAlerts,
  } = useAlertsList({
    page,
    pageSize,
    cleared: statusFilter === 'all' ? undefined : statusFilter === 'cleared',
    kind: kindFilter || undefined,
    deviceId: deviceFilter || undefined,
  })

  const alerts = alertsData?.alerts ?? []
  const alertsTotal = alertsData?.total ?? 0
  const alertsPages = Math.max(1, Math.ceil(alertsTotal / pageSize))

  // ── Qoidalar ──
  const {
    data: alertRules,
    isLoading: rulesLoading,
    isError: rulesIsError,
    error: rulesQueryError,
    refetch: refetchRules,
  } = useAlertRules()
  const { data: buildings } = useBuildings()

  const [clearing, setClearing] = useState(false)
  const [confirmPending, setConfirmPending] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  // Qoida yaratish formasi
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false)
  const [utilityType, setUtilityType] = useState<UtilityType>('electricity')
  const [kind, setKind] = useState<string>('overvoltage')
  const [buildingId, setBuildingId] = useState('all')
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [severity, setSeverity] = useState('warning')
  const [message, setMessage] = useState('')
  const [dedupeSec, setDedupeSec] = useState('300')
  const [submitting, setSubmitting] = useState(false)
  const [ruleError, setRuleError] = useState<string | null>(null)

  const currentRuleOptions = alertRuleOptions[utilityType] ?? alertRuleOptions.electricity

  useEffect(() => {
    if (!currentRuleOptions.some((option) => option.value === kind)) {
      setKind(currentRuleOptions[0].value)
    }
  }, [currentRuleOptions, kind])

  // ── Amallar ──

  const handleClearAlert = async (id: number) => {
    try {
      await apiClient.post(`/api/alerts/${id}/clear`)
      queryClient.invalidateQueries({ queryKey: qk.alerts() })
      notifySuccess('Ogohlantirish tozalandi')
    } catch (err) {
      notifyError('Ogohlantirish tozalanmadi', getApiErrorMessage(err))
    }
  }

  const handleClearAll = async () => {
    setClearing(true)
    setConfirmPending(true)
    try {
      await apiClient.post('/api/alerts/clear-all')
      queryClient.invalidateQueries({ queryKey: qk.alerts() })
      notifySuccess('Ogohlantirishlar tozalandi')
    } catch (err) {
      notifyError('Ogohlantirishlar tozalanmadi', getApiErrorMessage(err))
    } finally {
      setClearing(false)
      setConfirmPending(false)
      setConfirmAction(null)
    }
  }

  const handleCreateRule = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setRuleError(null)
    try {
      await apiClient.post('/api/alert-rules', {
        kind,
        utility_type: utilityType || null,
        building_id: buildingId !== 'all' ? parseInt(buildingId) : null,
        min_value: minValue ? parseFloat(minValue) : null,
        max_value: maxValue ? parseFloat(maxValue) : null,
        severity,
        dedupe_sec: dedupeSec ? parseInt(dedupeSec) : null,
        message: message || null,
        enabled: true,
      })
      queryClient.invalidateQueries({ queryKey: qk.alertRules() })
      setIsRuleDialogOpen(false)
      setUtilityType('electricity')
      setKind('overvoltage')
      setBuildingId('all')
      setMinValue('')
      setMaxValue('')
      setSeverity('warning')
      setMessage('')
      setDedupeSec('300')
      notifySuccess('Qoida yaratildi')
    } catch (err) {
      setRuleError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRule = async (id: number) => {
    setConfirmPending(true)
    try {
      await apiClient.delete(`/api/alert-rules/${id}`)
      queryClient.invalidateQueries({ queryKey: qk.alertRules() })
      notifySuccess("Qoida o'chirildi")
    } catch (err) {
      notifyError("Qoida o'chirilmadi", getApiErrorMessage(err))
    } finally {
      setConfirmPending(false)
      setConfirmAction(null)
    }
  }

  const handleToggleRule = async (rule: AlertRule) => {
    try {
      await apiClient.put(`/api/alert-rules/${rule.id}`, {
        ...rule,
        enabled: !rule.enabled,
      })
      queryClient.invalidateQueries({ queryKey: qk.alertRules() })
      notifySuccess(rule.enabled ? "Qoida o'chirildi" : 'Qoida yoqildi')
    } catch (err) {
      notifyError('Qoida yangilanmadi', getApiErrorMessage(err))
    }
  }

  const buildingNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const b of buildings ?? []) map.set(b.id, b.name)
    return map
  }, [buildings])

  return (
    <div className="space-y-6">
      {/* Sarlavha */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Ogohlantirishlar</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'history' && isAdmin && (
            <Button
              variant="destructive"
              disabled={clearing || alertsTotal === 0}
              onClick={() => setConfirmAction({ type: 'clear-all' })}
            >
              <Trash2 className="h-4 w-4" />
              Barchasini tozalash
            </Button>
          )}
          {activeTab === 'rules' && isAdmin && (
            <Button onClick={() => setIsRuleDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Yangi qoida qo'shish
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'history' | 'rules')}>
        <TabsList>
          <TabsTrigger value="history">Ogohlantirishlar jurnali</TabsTrigger>
          <TabsTrigger value="rules">
            Chegara qoidalari ({alertRules?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* ─── Jurnal ─── */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="relative min-w-[180px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={kindInput}
                  onChange={(e) => setKindInput(e.target.value)}
                  placeholder="Tur (kind) bo'yicha filtrlash..."
                  className="pl-8"
                />
              </div>
              <Input
                value={deviceInput}
                onChange={(e) => setDeviceInput(e.target.value)}
                placeholder="Qurilma ID..."
                className="w-44"
              />
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as 'all' | 'open' | 'cleared')}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barcha holatlar</SelectItem>
                  <SelectItem value="open">Ochiq</SelectItem>
                  <SelectItem value="cleared">Tozalangan</SelectItem>
                </SelectContent>
              </Select>
              <span className="ml-auto text-xs text-muted-foreground">
                {alertsTotal} ta ogohlantirish
              </span>
            </CardContent>
          </Card>

          {alertsLoading ? (
            <TableSkeleton rows={6} />
          ) : alertsIsError ? (
            <ErrorBlock
              message={getApiErrorMessage(alertsQueryError)}
              onRetry={() => refetchAlerts()}
            />
          ) : alerts.length > 0 ? (
            <Card className="py-0">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{translations.alerts.severity}</TableHead>
                        <TableHead>{translations.alerts.kind}</TableHead>
                        <TableHead>{translations.alerts.message}</TableHead>
                        <TableHead>Qurilma</TableHead>
                        <TableHead>{translations.alerts.timestamp}</TableHead>
                        <TableHead>{translations.alerts.status}</TableHead>
                        {isAdmin && <TableHead className="text-right">Amallar</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alerts.map((alert) => (
                        <TableRow key={alert.id}>
                          <TableCell>
                            <SeverityBadge severity={alert.severity} />
                          </TableCell>
                          <TableCell className="font-medium">{alert.kind}</TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">
                            {alert.message ?? '—'}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {alert.device_id}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(alert.ts * 1000), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            {alert.cleared ? (
                              <Badge variant="secondary">{translations.alerts.cleared}</Badge>
                            ) : (
                              <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-500">
                                {translations.alerts.open}
                              </Badge>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right">
                              {!alert.cleared && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleClearAlert(alert.id)}
                                >
                                  <Check className="h-4 w-4" />
                                  Tozalash
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t px-4 py-3">
                  <Pagination
                    page={page}
                    pages={alertsPages}
                    total={alertsTotal}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyBlock
              title="Ma'lumot topilmadi"
              message="Ushbu filtrga mos ogohlantirishlar mavjud emas."
            />
          )}
        </TabsContent>

        {/* ─── Qoidalar ─── */}
        <TabsContent value="rules" className="mt-4 space-y-4">
          {rulesLoading ? (
            <TableSkeleton rows={6} />
          ) : rulesIsError ? (
            <ErrorBlock
              message={getApiErrorMessage(rulesQueryError)}
              onRetry={() => refetchRules()}
            />
          ) : (alertRules?.length ?? 0) > 0 ? (
            <Card className="py-0">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Qoida turi</TableHead>
                        <TableHead>Datchik</TableHead>
                        <TableHead>Bino</TableHead>
                        <TableHead>Chegaralar</TableHead>
                        <TableHead>Daraja</TableHead>
                        <TableHead>Holat</TableHead>
                        {isAdmin && <TableHead className="text-right">Amallar</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(alertRules ?? []).map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">{rule.kind}</TableCell>
                          <TableCell>{utilityLabel(rule.utility_type)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {rule.building_id != null
                              ? buildingNameById.get(rule.building_id) ?? `#${rule.building_id}`
                              : 'Barcha binolar'}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {thresholdText(rule)}
                          </TableCell>
                          <TableCell>
                            <SeverityBadge severity={rule.severity} />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={rule.enabled}
                              disabled={!isAdmin}
                              onCheckedChange={() => handleToggleRule(rule)}
                            />
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-500"
                                title="Qoidani o'chirish"
                                onClick={() =>
                                  setConfirmAction({ type: 'delete-rule', id: rule.id })
                                }
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
              </CardContent>
            </Card>
          ) : (
            <EmptyBlock
              title="Ma'lumot topilmadi"
              message="Sizda hali chegara qoidalari sozlanmagan."
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Yangi qoida dialogi */}
      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Yangi ogohlantirish qoidasi
            </DialogTitle>
            <DialogDescription>
              Chegara qiymatlari asosida avtomatik ogohlantirish yaratiladi.
            </DialogDescription>
          </DialogHeader>
          {ruleError && (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
              {ruleError}
            </p>
          )}
          <form onSubmit={handleCreateRule} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Datchik turi</Label>
                <Select
                  value={utilityType}
                  onValueChange={(v) => setUtilityType(v as UtilityType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="electricity">Elektr</SelectItem>
                    <SelectItem value="water">Suv</SelectItem>
                    <SelectItem value="gas">Gaz</SelectItem>
                    <SelectItem value="soil">Yerto'la</SelectItem>
                    <SelectItem value="sound">Ovoz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Qoida turi *</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currentRuleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bino filtri</Label>
                <Select value={buildingId} onValueChange={setBuildingId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Barcha binolar</SelectItem>
                    {buildings?.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Daraja (Severity)</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rule-min">Minimal qiymat</Label>
                <Input
                  id="rule-min"
                  type="number"
                  step="any"
                  value={minValue}
                  onChange={(e) => setMinValue(e.target.value)}
                  placeholder="Masalan: 190"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-max">Maksimal qiymat</Label>
                <Input
                  id="rule-max"
                  type="number"
                  step="any"
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  placeholder="Masalan: 240"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-dedupe">Deduplication (sec)</Label>
              <Input
                id="rule-dedupe"
                type="number"
                min={0}
                value={dedupeSec}
                onChange={(e) => setDedupeSec(e.target.value)}
                placeholder="Masalan: 300"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-message">Xabar matni *</Label>
              <Input
                id="rule-message"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Masalan: Kuchlanish me'yordan oshib ketdi!"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRuleDialogOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saqlanmoqda...' : 'Qoidani saqlash'}
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
              {confirmAction?.type === 'clear-all'
                ? 'Barcha ogohlantirishlarni tozalash'
                : "Qoidani o'chirish"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'clear-all'
                ? 'Barcha ochiq ogohlantirishlar tozalanadi. Amalni davom ettirasizmi?'
                : "Bu chegara qoidasi o'chiriladi. Keyingi o'lchovlarda bu qoida ishlamaydi."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmPending}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmPending}
              className="bg-red-500 text-white hover:bg-red-500/90"
              onClick={(e) => {
                e.preventDefault()
                if (confirmAction?.type === 'clear-all') handleClearAll()
                else if (confirmAction?.type === 'delete-rule') handleDeleteRule(confirmAction.id)
              }}
            >
              {confirmPending
                ? 'Bajarilmoqda...'
                : confirmAction?.type === 'clear-all'
                  ? 'Barchasini tozalash'
                  : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
