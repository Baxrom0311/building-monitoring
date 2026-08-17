import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, Pencil, Plus, Search, ToggleLeft, ToggleRight, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { useUsersList, qk } from '@/hooks/queries'
import apiClient from '@/lib/api'
import type { User } from '@/types/api'
import { EmptyBlock, ErrorBlock, TableSkeleton } from '@/components/StateBlock'
import { getApiErrorMessage } from '@/lib/errors'
import { notify, notifyError, notifySuccess } from '@/lib/toast'
import { Pagination } from '@/components/Pagination'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

const DEFAULT_PAGE_SIZE = 15

type RoleFilter = 'all' | 'admin' | 'user' | 'viewer'
type StatusFilter = 'all' | 'active' | 'inactive'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  user: 'Foydalanuvchi',
  viewer: "Ko'rgazma",
}

function roleBadge(role: User['role']) {
  if (role === 'admin') return <Badge>Admin</Badge>
  if (role === 'viewer') return <Badge variant="outline">Ko'rgazma</Badge>
  return <Badge variant="secondary">User</Badge>
}

export default function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth()
  const queryClient = useQueryClient()

  // ── Filter state (server-side) ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<'username' | 'role' | 'status'>('username')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // ── Create dialog ──────────────────────────────────────────────────────────
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [submitting, setSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // ── Edit dialog ────────────────────────────────────────────────────────────
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editRole, setEditRole] = useState('user')
  const [editPassword, setEditPassword] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // ── Deactivate confirmation (AlertDialog) ──────────────────────────────────
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  // Reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [searchQuery, roleFilter, statusFilter, sortBy, sortOrder])

  const { data, isLoading, isError, error: queryError, refetch, isFetching } = useUsersList({
    page,
    pageSize,
    q: searchQuery.trim() || undefined,
    role: roleFilter !== 'all' ? roleFilter : undefined,
    isActive: statusFilter !== 'all' ? statusFilter === 'active' : undefined,
    sortBy,
    sortOrder,
  })

  const users = data?.users ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.users() })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setSubmitting(true)
    setCreateError(null)
    try {
      await apiClient.post('/api/auth/users', { username, password, role })
      invalidate()
      notifySuccess('Foydalanuvchi yaratildi', username)
      setIsCreateOpen(false)
      setUsername('')
      setPassword('')
      setRole('user')
    } catch (err) {
      setCreateError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (targetUser: User) => {
    if (targetUser.id === currentUser?.id) {
      notify({
        type: 'warning',
        title: 'Amal bajarilmadi',
        message: "O'zingizning faollik holatingizni o'zgartira olmaysiz.",
      })
      return
    }
    // Deactivation is destructive — confirm via AlertDialog
    if (targetUser.is_active) {
      setDeactivateTarget(targetUser)
      return
    }
    try {
      await apiClient.put(`/api/auth/users/${targetUser.id}`, { is_active: true, role: targetUser.role })
      invalidate()
      notifySuccess('Foydalanuvchi faollashtirildi', targetUser.username)
    } catch (err) {
      notifyError('Foydalanuvchi yangilanmadi', getApiErrorMessage(err))
    }
  }

  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await apiClient.put(`/api/auth/users/${deactivateTarget.id}`, {
        is_active: false,
        role: deactivateTarget.role,
      })
      invalidate()
      notifySuccess('Foydalanuvchi faolsizlantirildi', deactivateTarget.username)
      setDeactivateTarget(null)
    } catch (err) {
      notifyError('Foydalanuvchi yangilanmadi', getApiErrorMessage(err))
    } finally {
      setDeactivating(false)
    }
  }

  const openEditDialog = (targetUser: User) => {
    setEditUser(targetUser)
    setEditRole(targetUser.role)
    setEditIsActive(targetUser.is_active)
    setEditPassword('')
    setEditError(null)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUser) return
    setUpdating(true)
    setEditError(null)
    try {
      await apiClient.put(`/api/auth/users/${editUser.id}`, {
        role: editRole,
        is_active: editIsActive,
        password: editPassword.trim() || null,
      })
      invalidate()
      notifySuccess('Foydalanuvchi tahrirlandi', editUser.username)
      setEditUser(null)
    } catch (err) {
      setEditError(getApiErrorMessage(err))
    } finally {
      setUpdating(false)
    }
  }

  const isSelf = (u: User) => u.id === currentUser?.id

  return (
    <div className="space-y-6">
      <PageHeader
        title="Foydalanuvchilar"
        icon={Users}
        subtitle={total > 0 && !isLoading ? `Jami ${total} ta foydalanuvchi` : undefined}
        actions={
          isAdmin ? (
            <Button onClick={() => { setCreateError(null); setIsCreateOpen(true) }}>
              <Plus className="h-4 w-4" />
              Yangi foydalanuvchi
            </Button>
          ) : undefined
        }
      />

      {/* ── Filter toolbar ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Username, ID yoki rol bo'yicha qidirish..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha rollar</SelectItem>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha statuslar</SelectItem>
                <SelectItem value="active">Faol</SelectItem>
                <SelectItem value="inactive">Faolsiz</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={`${sortBy}:${sortOrder}`}
              onValueChange={(v) => {
                const [sb, so] = v.split(':')
                setSortBy(sb as typeof sortBy)
                setSortOrder(so as 'asc' | 'desc')
              }}
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="username:asc">Username A→Z</SelectItem>
                <SelectItem value="username:desc">Username Z→A</SelectItem>
                <SelectItem value="role:asc">Rol</SelectItem>
                <SelectItem value="status:desc">Faol avval</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : isError ? (
        <ErrorBlock message={getApiErrorMessage(queryError)} onRetry={() => refetch()} />
      ) : users.length > 0 ? (
        <Card className={cn('transition-opacity', isFetching && 'opacity-70')}>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Foydalanuvchi</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Holat</TableHead>
                    {isAdmin && <TableHead className="text-right">Amallar</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.username}</span>
                          {isSelf(u) && <Badge variant="outline">Siz</Badge>}
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">ID: {u.id}</p>
                      </TableCell>
                      <TableCell>{roleBadge(u.role)}</TableCell>
                      <TableCell>
                        {u.is_active ? (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-500">Faol</Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-500/30 text-red-500">Faolsiz</Badge>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isSelf(u)}
                              title={
                                isSelf(u)
                                  ? "O'z holatingizni o'zgartira olmaysiz"
                                  : u.is_active
                                    ? 'Faolsizlantirish'
                                    : 'Faollashtirish'
                              }
                              onClick={() => handleToggleActive(u)}
                            >
                              {u.is_active ? (
                                <ToggleRight className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Tahrirlash / Parolni yangilash"
                              onClick={() => openEditDialog(u)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              page={page}
              pages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      ) : (
        <EmptyBlock title="Ma'lumot yo'q" message="Hozircha foydalanuvchilar ro'yxati bo'sh." />
      )}

      {/* ── Create dialog ── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi foydalanuvchi</DialogTitle>
            <DialogDescription>Username, parol va rolni kiriting.</DialogDescription>
          </DialogHeader>
          {createError && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{createError}</p>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Foydalanuvchi nomi *</Label>
              <Input
                id="user-name"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masalan: boxrom_admin"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-password">Parol *</Label>
              <Input
                id="user-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Parol kiriting"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* ── Edit dialog ── */}
      <Dialog open={editUser !== null} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Foydalanuvchini tahrirlash</DialogTitle>
            <DialogDescription>{editUser?.username}</DialogDescription>
          </DialogHeader>
          {editError && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{editError}</p>
          )}
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-password">Yangi parol (ixtiyoriy)</Label>
              <Input
                id="edit-password"
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="O'zgartirmaslik uchun bo'sh qoldiring"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select
                value={editRole}
                onValueChange={setEditRole}
                disabled={editUser !== null && isSelf(editUser)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editUser !== null && isSelf(editUser) && (
                <p className="text-xs text-muted-foreground">O'z rolingizni pasaytira olmaysiz.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Holat</Label>
              <Select
                value={editIsActive ? 'true' : 'false'}
                onValueChange={(v) => setEditIsActive(v === 'true')}
                disabled={editUser !== null && isSelf(editUser)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Faol</SelectItem>
                  <SelectItem value="false">Faolsiz</SelectItem>
                </SelectContent>
              </Select>
              {editUser !== null && isSelf(editUser) && (
                <p className="text-xs text-muted-foreground">O'z holatingizni o'zgartira olmaysiz.</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={updating}>
                {updating ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate confirmation ── */}
      <AlertDialog open={deactivateTarget !== null} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Foydalanuvchi faolsizlantirilsinmi?</AlertDialogTitle>
            <AlertDialogDescription className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-red-500" />
              {deactivateTarget
                ? `"${deactivateTarget.username}" tizimga kira olmaydigan bo'ladi. Keyinroq qayta faollashtirish mumkin.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-500/90"
              disabled={deactivating}
              onClick={(e) => {
                e.preventDefault()
                void handleDeactivateConfirm()
              }}
            >
              {deactivating ? 'Bajarilmoqda...' : 'Faolsizlantirish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
