import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Bot,
  Copy,
  Database,
  Download,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useBackups, useBuildings, useProvisioningTokens, useSummary, qk } from '@/hooks/queries'
import apiClient from '@/lib/api'
import { formatTs } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/env'
import type { BackupItem, ProvisioningToken } from '@/types/api'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/StateBlock'
import { KPICard } from '@/components/KPICard'
import { getApiErrorMessage } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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

const UTILITY_OPTIONS = [
  { value: 'electricity', label: 'Elektr' },
  { value: 'water', label: 'Suv' },
  { value: 'gas', label: 'Gaz' },
  { value: 'soil', label: "Yerto'la" },
  { value: 'sound', label: 'Ovoz' },
]

function tokenStatusBadge(t: ProvisioningToken) {
  const now = Date.now() / 1000
  if (t.revoked_at) return <Badge variant="outline" className="text-muted-foreground">Bekor qilingan</Badge>
  if (t.used_at)
    return (
      <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">
        Ishlatildi{t.used_by_device_id ? ` → ${t.used_by_device_id}` : ''}
      </Badge>
    )
  if (t.expires_at < now) return <Badge variant="outline" className="border-amber-500/30 text-amber-500">Muddati o'tgan</Badge>
  return <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">Faol</Badge>
}

function isTokenActive(t: ProvisioningToken) {
  return !t.revoked_at && !t.used_at && t.expires_at > Date.now() / 1000
}

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryIsError,
    error: summaryError,
    refetch: refetchSummary,
  } = useSummary()
  const { data: backupData, isLoading: backupsLoading } = useBackups()
  const { data: provTokenData, refetch: refetchProvTokens } = useProvisioningTokens(false)
  const { data: buildings = [] } = useBuildings()
  const provTokens = provTokenData?.tokens ?? []

  // ── System settings (frontend-local, old page behavior) ────────────────────
  const [apiBase, setApiBase] = useState(API_BASE_URL)
  const [retention, setRetention] = useState('90')
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [tgEnabled, setTgEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  // ── Backups ────────────────────────────────────────────────────────────────
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BackupItem | null>(null)

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/api/backups?reason=manual')
      return data
    },
    onSuccess: (data) => {
      notifySuccess('Zahira nusxa yaratildi', `Fayl: ${data.filename}`)
      queryClient.invalidateQueries({ queryKey: qk.backups() })
    },
    onError: (err) => {
      notifyError("Backup yaratib bo'lmadi", getApiErrorMessage(err))
    },
  })

  const deleteBackupMutation = useMutation({
    mutationFn: async (filename: string) => {
      const { data } = await apiClient.delete(`/api/backups/${filename}`)
      return data
    },
    onSuccess: () => {
      notifySuccess("Backup o'chirildi")
      queryClient.invalidateQueries({ queryKey: qk.backups() })
      setDeleteTarget(null)
    },
    onError: (err) => {
      notifyError("Backup o'chirishda xatolik", getApiErrorMessage(err))
    },
  })

  const restoreBackupMutation = useMutation({
    mutationFn: async (filename: string) => {
      const { data } = await apiClient.post(`/api/backups/restore/${filename}?confirm=RESTORE`)
      return data
    },
    onSuccess: () => {
      notifySuccess("Ma'lumotlar bazasi qayta tiklandi (Restore)", 'Tizim qayta yuklandi.')
      queryClient.invalidateQueries()
      setRestoreTarget(null)
    },
    onError: (err) => {
      notifyError('Restore xatoligi', getApiErrorMessage(err))
    },
  })

  const handleDownload = async (filename: string) => {
    try {
      // window.open Authorization header yubormaydi (doim 401) — apiClient orqali blob sifatida olamiz
      const { data } = await apiClient.get(`/api/backups/download/${filename}`, { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      notifyError("Backupni yuklab bo'lmadi", getApiErrorMessage(err))
    }
  }

  // ── Provisioning tokens ────────────────────────────────────────────────────
  const [isProvTokenOpen, setIsProvTokenOpen] = useState(false)
  const [provUtility, setProvUtility] = useState('electricity')
  const [provBuildingId, setProvBuildingId] = useState('none')
  const [provTtlDays, setProvTtlDays] = useState(1)
  const [provCreating, setProvCreating] = useState(false)
  const [newTokenValue, setNewTokenValue] = useState('')
  const [provError, setProvError] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<ProvisioningToken | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [showAllProvTokens, setShowAllProvTokens] = useState(false)

  const createProvToken = async () => {
    setProvCreating(true)
    setProvError('')
    setNewTokenValue('')
    try {
      const { data } = await apiClient.post('/api/devices/provisioning-tokens', {
        utility_type: provUtility || null,
        building_id: provBuildingId !== 'none' ? parseInt(provBuildingId) : null,
        ttl_sec: provTtlDays * 86400,
      })
      setNewTokenValue(data.provisioning_token)
      await refetchProvTokens()
      notifySuccess('Provisioning token yaratildi')
    } catch (err) {
      setProvError(getApiErrorMessage(err))
    } finally {
      setProvCreating(false)
    }
  }

  const revokeProvToken = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await apiClient.delete(`/api/devices/provisioning-tokens/${revokeTarget.id}`)
      await refetchProvTokens()
      notifySuccess('Token bekor qilindi')
      setRevokeTarget(null)
    } catch (err) {
      notifyError("Tokenni bekor qilib bo'lmadi", getApiErrorMessage(err))
    } finally {
      setRevoking(false)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      notifySuccess('Sozlamalar saqlandi', 'Frontend sozlamalari lokal holatda yangilandi.')
    }, 600)
  }

  const visibleTokens = provTokens.filter((t) => showAllProvTokens || isTokenActive(t))
  const activeTokenCount = provTokens.filter(isTokenActive).length

  return (
    <div className="space-y-6">
      {/* ── Intro row ── */}
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Sozlamalar</h1>
      </div>

      <Tabs defaultValue={isAdmin ? 'backups' : 'system'}>
        <TabsList>
          {isAdmin && <TabsTrigger value="backups">Zahira nusxalar</TabsTrigger>}
          {isAdmin && <TabsTrigger value="tokens">Provisioning tokenlar</TabsTrigger>}
          <TabsTrigger value="system">Tizim</TabsTrigger>
        </TabsList>

        {/* ── Backups ── */}
        {isAdmin && (
          <TabsContent value="backups" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="h-4 w-4 text-emerald-500" />
                    Ma'lumotlar bazasi zaxira nusxalari
                  </CardTitle>
                  <CardDescription>Backup yaratish, yuklab olish, tiklash va o'chirish.</CardDescription>
                </div>
                <Button
                  size="sm"
                  disabled={createBackupMutation.isPending}
                  onClick={() => createBackupMutation.mutate()}
                >
                  <RefreshCw className={createBackupMutation.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  {createBackupMutation.isPending ? 'Yaratilmoqda...' : 'Yangi backup'}
                </Button>
              </CardHeader>
              <CardContent>
                {backupsLoading ? (
                  <LoadingBlock title="Backuplar yuklanmoqda..." />
                ) : backupData?.backups && backupData.backups.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fayl nomi</TableHead>
                          <TableHead>Hajmi</TableHead>
                          <TableHead>Yaratilgan vaqti</TableHead>
                          <TableHead className="text-right">Amallar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backupData.backups.map((b) => (
                          <TableRow key={b.filename}>
                            <TableCell className="font-mono text-xs font-medium">{b.filename}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {(b.size / (1024 * 1024)).toFixed(2)} MB
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {formatTs(b.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Yuklab olish"
                                  onClick={() => handleDownload(b.filename)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Restore"
                                  className="text-amber-500 hover:text-amber-500"
                                  onClick={() => setRestoreTarget(b)}
                                >
                                  <ShieldAlert className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="O'chirish"
                                  className="text-red-500 hover:text-red-500"
                                  onClick={() => setDeleteTarget(b)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <EmptyBlock title="Backup topilmadi" message="Hozircha saqlangan ma'lumotlar bazasi nusxalari yo'q." />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Provisioning tokens ── */}
        {isAdmin && (
          <TabsContent value="tokens" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <KeyRound className="h-4 w-4" />
                    Provisioning tokenlar
                    <Badge variant="outline">{activeTokenCount} faol</Badge>
                  </CardTitle>
                  <CardDescription>ESP32 qurilmalarini ro'yxatdan o'tkazish uchun bir martalik tokenlar.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowAllProvTokens((v) => !v)}>
                    {showAllProvTokens ? "Faqat faollar" : 'Barchasi'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsProvTokenOpen(true)
                      setNewTokenValue('')
                      setProvError('')
                      setProvBuildingId('none')
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Yangi token
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {visibleTokens.length === 0 ? (
                  <EmptyBlock title="Tokenlar yo'q" message="Hali hech qanday provisioning token yaratilmagan." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Muddati</TableHead>
                          <TableHead>Tur</TableHead>
                          <TableHead>Holat</TableHead>
                          <TableHead>Yaratuvchi</TableHead>
                          <TableHead className="text-right">Amal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleTokens.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">#{t.id}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs">
                              {formatTs(t.expires_at)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{t.utility_type ?? 'barcha'}</Badge>
                            </TableCell>
                            <TableCell>{tokenStatusBadge(t)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {t.created_by_username ?? '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {isTokenActive(t) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Bekor qilish"
                                  className="text-red-500 hover:text-red-500"
                                  onClick={() => setRevokeTarget(t)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── System ── */}
        <TabsContent value="system" className="space-y-4">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings className="h-4 w-4" />
                    Tizim sozlamalari
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="api-base">Server API Base URL</Label>
                    <Input
                      id="api-base"
                      type="url"
                      value={apiBase}
                      onChange={(e) => setApiBase(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ma'lumotlarni saqlash muddati</Label>
                    <Select value={retention} onValueChange={setRetention}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 kun</SelectItem>
                        <SelectItem value="90">90 kun (3 oy)</SelectItem>
                        <SelectItem value="180">180 kun (6 oy)</SelectItem>
                        <SelectItem value="365">365 kun (1 yil)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-4 w-4" />
                    Telegram xabarnomalari
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-sm">Telegram ogohlantirishlarini yoqish</span>
                    <Switch checked={tgEnabled} onCheckedChange={setTgEnabled} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tg-token">Telegram Bot Token</Label>
                    <Input
                      id="tg-token"
                      type="password"
                      disabled={!tgEnabled}
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="Bot tokenni kiriting"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tg-chat">Telegram Chat / Group ID</Label>
                    <Input
                      id="tg-chat"
                      disabled={!tgEnabled}
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      placeholder="Masalan: -100xxxxxxxxxx"
                      className="font-mono"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" />
                  Tizim holati (System Health)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {summaryLoading ? (
                  <LoadingBlock title="Tizim holati yuklanmoqda..." />
                ) : summaryIsError ? (
                  <ErrorBlock
                    title="Tizim holati olinmadi"
                    message={getApiErrorMessage(summaryError)}
                    onRetry={() => refetchSummary()}
                  />
                ) : summary ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <KPICard title="WS ulanishlar" value={summary.ws_clients ?? 0} />
                    <KPICard title="O'lchov nuqtalari" value={summary.measurement_points ?? 0} tone="success" />
                    <KPICard title="Binolar soni" value={summary.buildings ?? 0} />
                    <KPICard title="Datchiklar jami" value={summary.devices_total ?? 0} tone="warning" />
                  </div>
                ) : (
                  <EmptyBlock title="Tizim holati topilmadi" message="Server health ma'lumot qaytarmadi." />
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'Saqlanmoqda...' : 'Sozlamalarni saqlash'}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>

      {/* ── Create provisioning token dialog ── */}
      <Dialog open={isProvTokenOpen} onOpenChange={setIsProvTokenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi provisioning token</DialogTitle>
            <DialogDescription>
              Token ESP32 WiFiManager sahifasida kiritiladi va faqat bir marta ishlatiladi.
            </DialogDescription>
          </DialogHeader>
          {newTokenValue ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Token muvaffaqiyatli yaratildi:</p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                <code className="flex-1 break-all font-mono text-sm">{newTokenValue}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(newTokenValue)
                    notifySuccess('Nusxalandi!')
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Nusxa
                </Button>
              </div>
              <p className="text-xs text-amber-500">Bu token faqat bir marta ko'rsatiladi — saqlang!</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsProvTokenOpen(false)}>Yopish</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {provError && (
                <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{provError}</p>
              )}
              <div className="space-y-1.5">
                <Label>Qurilma turi</Label>
                <Select value={provUtility} onValueChange={setProvUtility}>
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
                <Label>Bino (ixtiyoriy)</Label>
                <Select value={provBuildingId} onValueChange={setProvBuildingId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Bino tanlanmagan —</SelectItem>
                    {buildings.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {provBuildingId !== 'none' && (
                  <p className="text-xs text-emerald-500">
                    ESP32 ro'yxatdan o'tganda shu binoga avtomatik ulanadi
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prov-ttl">Amal qilish muddati (kun)</Label>
                <Input
                  id="prov-ttl"
                  type="number"
                  min={1}
                  max={30}
                  value={provTtlDays}
                  onChange={(e) => setProvTtlDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                />
                <p className="text-xs text-muted-foreground">1 kundan 30 kungacha.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsProvTokenOpen(false)}>Bekor qilish</Button>
                <Button disabled={provCreating} onClick={() => void createProvToken()}>
                  {provCreating ? 'Yaratilmoqda...' : 'Token yaratish'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Restore confirmation ── */}
      <AlertDialog open={restoreTarget !== null} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bazani qayta tiklash (Restore)?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget
                ? `'${restoreTarget.filename}' faylidan ma'lumotlar bazasi qayta tiklanadi. Joriy ma'lumotlar ustidan yoziladi!`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 text-white hover:bg-amber-500/90"
              disabled={restoreBackupMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (restoreTarget) restoreBackupMutation.mutate(restoreTarget.filename)
              }}
            >
              {restoreBackupMutation.isPending ? 'Tiklanmoqda...' : 'Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete backup confirmation ── */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backup o'chirilsinmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `'${deleteTarget.filename}' fayli butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-500/90"
              disabled={deleteBackupMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteBackupMutation.mutate(deleteTarget.filename)
              }}
            >
              {deleteBackupMutation.isPending ? "O'chirilmoqda..." : "O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Revoke token confirmation ── */}
      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Token bekor qilinsinmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget ? `#${revokeTarget.id} token bekor qilinadi va qurilma u bilan ro'yxatdan o'ta olmaydi.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-500/90"
              disabled={revoking}
              onClick={(e) => {
                e.preventDefault()
                void revokeProvToken()
              }}
            >
              {revoking ? 'Bajarilmoqda...' : 'Bekor qilish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
