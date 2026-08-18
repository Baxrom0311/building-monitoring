import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download, ScrollText, Search } from 'lucide-react'
import apiClient from '@/lib/api'
import { qk } from '@/hooks/queries'
import type { AuditLog, AuditLogListResponse } from '@/types/api'
import { EmptyBlock, ErrorBlock, TableSkeleton } from '@/components/StateBlock'
import { getApiErrorMessage } from '@/lib/errors'
import { notifySuccess } from '@/lib/toast'
import { downloadCsv } from '@/lib/table'
import { Pagination } from '@/components/Pagination'
import { cn, formatTs } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const PAGE_SIZE = 50

const ENTITY_OPTIONS = [
  { value: 'all', label: 'Barcha resurslar' },
  { value: 'user', label: 'Foydalanuvchilar' },
  { value: 'device', label: 'Qurilmalar' },
  { value: 'building', label: 'Binolar' },
  { value: 'firmware', label: 'Firmware' },
  { value: 'ota_batch', label: 'OTA batch' },
]

interface AuditFilters {
  action?: string
  entity_type?: string
  username?: string
  since_ts?: number
  until_ts?: number
}

// In-page query: shared useAuditLogs hook doesn't support date filters,
// so we query the same endpoint under the same qk key family.
function useAuditLogsFiltered(page: number, filters: AuditFilters) {
  return useQuery({
    queryKey: qk.auditLogs(PAGE_SIZE, page, filters),
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) })
      if (filters.action) params.append('action', filters.action)
      if (filters.entity_type) params.append('entity_type', filters.entity_type)
      if (filters.username) params.append('username', filters.username)
      if (filters.since_ts) params.append('since_ts', String(filters.since_ts))
      if (filters.until_ts) params.append('until_ts', String(filters.until_ts))
      const { data } = await apiClient.get(`/api/audit-logs?${params}`)
      return data as AuditLogListResponse
    },
    placeholderData: keepPreviousData,
  })
}

function prettyDetail(detail: string | null): string {
  if (!detail) return '—'
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null)

  useEffect(() => {
    setPage(1)
  }, [actionFilter, entityFilter, userFilter, dateFrom, dateTo])

  const filters: AuditFilters = {
    action: actionFilter.trim() || undefined,
    entity_type: entityFilter !== 'all' ? entityFilter : undefined,
    username: userFilter.trim() || undefined,
    since_ts: dateFrom ? Math.floor(new Date(dateFrom).getTime() / 1000) : undefined,
    until_ts: dateTo ? Math.floor(new Date(dateTo).getTime() / 1000) + 86399 : undefined,
  }

  const { data, isLoading, isError, error: queryError, refetch, isFetching } = useAuditLogsFiltered(page, filters)

  const logs = data?.audit_logs ?? []
  const totalPages = data?.pages ?? 1
  const total = data?.total ?? 0

  const handleExportCSV = () => {
    if (logs.length === 0) return
    downloadCsv(
      `audit_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Detail'],
      logs.map((log) => [
        new Date(log.ts * 1000).toISOString(),
        log.username ?? log.user_id ?? '',
        log.action,
        log.entity_type ?? '',
        log.entity_id ?? '',
        log.detail ?? '',
      ]),
    )
    notifySuccess('Audit CSV eksport qilindi', `${logs.length} ta yozuv eksport qilindi.`)
  }

  return (
    <div className="space-y-6">
      {/* ── Intro row ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">Audit jurnali</h1>
        </div>
        <Button variant="outline" size="sm" disabled={logs.length === 0} onClick={handleExportCSV}>
          <Download className="h-4 w-4" />
          CSV
        </Button>
      </div>

      {/* ── Filter bar ── */}
      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="audit-action">Amal</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="audit-action"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                placeholder="masalan: ota.upload"
                className="pl-9 font-mono"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Resurs turi</Label>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-user">Foydalanuvchi</Label>
            <Input
              id="audit-user"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-from">Sanadan</Label>
            <Input id="audit-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-to">Sanagacha</Label>
            <Input id="audit-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : isError ? (
        <ErrorBlock message={getApiErrorMessage(queryError)} onRetry={() => refetch()} />
      ) : logs.length > 0 ? (
        <Card className={cn('transition-opacity', isFetching && 'opacity-70')}>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vaqt</TableHead>
                    <TableHead>Foydalanuvchi</TableHead>
                    <TableHead>Amal</TableHead>
                    <TableHead>Resurs turi</TableHead>
                    <TableHead>Resurs ID</TableHead>
                    <TableHead>Tafsilot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer"
                      onClick={() => setDetailLog(log)}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {formatTs(log.ts)}
                      </TableCell>
                      <TableCell className="font-medium">{log.username ?? log.user_id ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">{log.entity_type ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{log.entity_id ?? '—'}</TableCell>
                      <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                        {log.detail ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} pages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </CardContent>
        </Card>
      ) : (
        <EmptyBlock title="Ma'lumot yo'q" message="Ushbu filtrga mos keluvchi audit yozuvlari topilmadi" />
      )}

      {/* ── Detail dialog ── */}
      <Dialog open={detailLog !== null} onOpenChange={(open) => !open && setDetailLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit yozuvi #{detailLog?.id}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {detailLog ? formatTs(detailLog.ts) : ''}
            </DialogDescription>
          </DialogHeader>
          {detailLog && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Foydalanuvchi</p>
                  <p className="font-medium">{detailLog.username ?? detailLog.user_id ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amal</p>
                  <p className="font-mono">{detailLog.action}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Resurs turi</p>
                  <p className="capitalize">{detailLog.entity_type ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Resurs ID</p>
                  <p className="font-mono">{detailLog.entity_id ?? '—'}</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Payload</p>
                <pre className="max-h-72 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs">
                  {prettyDetail(detailLog.detail)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
