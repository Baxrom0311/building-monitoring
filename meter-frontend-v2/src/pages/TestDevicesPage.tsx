import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Cpu,
  FlaskConical,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
  Wifi,
} from 'lucide-react'
import { qk, useDevicesList } from '@/hooks/queries'
import apiClient from '@/lib/api'
import { getApiErrorMessage } from '@/lib/errors'
import { notifyError, notifySuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { Device } from '@/types/api'
import { EmptyBlock, ErrorBlock, TableSkeleton } from '@/components/StateBlock'
import { KPICard } from '@/components/KPICard'
import { Pagination } from '@/components/Pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

const DEFAULT_PAGE_SIZE = 20
const TEST_METER_SERIAL = '202032000525'

interface SimulationResponse {
  ok: boolean
  saved: boolean
  guarded: boolean
  message: string
  ts?: number | null
  device?: Device | null
}

function formatTime(ts?: number | null) {
  return ts ? new Date(ts * 1000).toLocaleString('uz-UZ') : '-'
}

function Countdown({ ts }: { ts?: number | null }) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0)

  useEffect(() => {
    if (!ts) return
    const calculateSeconds = () => {
      const left = ts - Math.floor(Date.now() / 1000)
      setSecondsLeft(left > 0 ? left : 0)
    }

    calculateSeconds()
    const interval = setInterval(calculateSeconds, 1000)
    return () => clearInterval(interval)
  }, [ts])

  if (!ts) return <span>-</span>
  if (secondsLeft <= 0) {
    return <span className="font-semibold text-red-500">muddati tugagan</span>
  }

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  return (
    <span>
      {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  )
}

export default function TestDevicesPage() {
  const queryClient = useQueryClient()
  const [macQuery, setMacQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [simDeviceId, setSimDeviceId] = useState('')
  const [simMeterSerial, setSimMeterSerial] = useState(TEST_METER_SERIAL)
  const [simEnergy, setSimEnergy] = useState('1')
  const [lastSimulation, setLastSimulation] = useState<SimulationResponse | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const { data, isLoading, isFetching, isError, error, refetch } = useDevicesList({
    page,
    pageSize,
    deviceId: macQuery.trim() || undefined,
    q: searchQuery.trim() || undefined,
    isTestDevice: true,
    sortBy: 'last_seen',
    sortOrder: 'desc',
  })

  const devices = data?.devices ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const onlineCount = devices.filter((device) => device.online).length
  const canSimulate = simDeviceId.trim().length > 0 && simMeterSerial.trim().length > 0

  const simulationMutation = useMutation({
    mutationFn: async (productionGuardOnly: boolean) => {
      const { data: result } = await apiClient.post<SimulationResponse>('/api/test-devices/simulate-reading', {
        device_id: simDeviceId.trim(),
        meter_serial: simMeterSerial.trim(),
        utility_type: 'electricity',
        energy_kwh: Number(simEnergy) || 1,
        production_guard_only: productionGuardOnly,
      })
      return result
    },
    onSuccess: (result) => {
      setLastSimulation(result)
      queryClient.invalidateQueries({ queryKey: qk.devices() })
      if (result.saved) {
        setMacQuery(simDeviceId.trim())
        setPage(1)
        notifySuccess('Test reading yuborildi', result.message)
      } else {
        notifySuccess('Guard tekshirildi', result.message)
      }
    },
    onError: (err) => {
      notifyError('Test flow bajarilmadi', getApiErrorMessage(err))
    },
  })

  return (
    <div className="space-y-6">
      {/* ── Sahifa sarlavhasi ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Test qurilmalar</h1>
            <p className="text-sm text-muted-foreground">
              Test hisoblagichlar production binolarga biriktirilmaydi va 5 minutdan keyin o'chiriladi.
            </p>
          </div>
        </div>
        <Button variant="outline" className="self-start lg:self-auto" onClick={() => refetch()}>
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Yangilash
        </Button>
      </div>

      {/* ── Statistika ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard title="Jami test" value={total} icon={FlaskConical} />
        <KPICard title="Online" value={onlineCount} icon={Wifi} tone="success" />
        <KPICard title="Test serial" value={TEST_METER_SERIAL} icon={Cpu} />
      </div>

      {/* ── Simulyatsiya ── */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <div className="space-y-2 xl:w-80">
              <Label htmlFor="sim-device-id">Simulate MAC / Device ID</Label>
              <Input
                id="sim-device-id"
                value={simDeviceId}
                onChange={(event) => setSimDeviceId(event.target.value)}
                placeholder="ESP32 MAC yoki device_id"
                className="font-mono"
              />
            </div>
            <div className="space-y-2 xl:w-56">
              <Label htmlFor="sim-meter-serial">Hisoblagich serial</Label>
              <Input
                id="sim-meter-serial"
                value={simMeterSerial}
                onChange={(event) => setSimMeterSerial(event.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2 xl:w-32">
              <Label htmlFor="sim-energy">kWh</Label>
              <Input
                id="sim-energy"
                type="number"
                min="0"
                step="0.001"
                value={simEnergy}
                onChange={(event) => setSimEnergy(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!canSimulate || simulationMutation.isPending}
                onClick={() => simulationMutation.mutate(false)}
              >
                <Play className="h-4 w-4" />
                Test reading
              </Button>
              <Button
                variant="outline"
                disabled={!canSimulate || simulationMutation.isPending}
                onClick={() => simulationMutation.mutate(true)}
              >
                <ShieldCheck className="h-4 w-4" />
                Guard tekshir
              </Button>
            </div>
          </div>

          {lastSimulation && (
            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                lastSimulation.guarded
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'
                  : 'border-border bg-muted/40 text-foreground',
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {lastSimulation.message}
              </div>
              {lastSimulation.device && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {lastSimulation.device.id} | cleanup: <Countdown ts={lastSimulation.device.auto_cleanup_at} />
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Qidiruv ── */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[minmax(0,320px)_minmax(0,420px)]">
          <div className="space-y-2">
            <Label htmlFor="mac-query">MAC / Device ID</Label>
            <div className="relative">
              <Cpu className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="mac-query"
                value={macQuery}
                onChange={(event) => {
                  setMacQuery(event.target.value)
                  setPage(1)
                }}
                placeholder="Masalan: esp32-... yoki MAC"
                className="pl-9 font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="search-query">Qo'shimcha qidiruv</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search-query"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  setPage(1)
                }}
                placeholder="Nom, serial, IP yoki turi bo'yicha..."
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Jadval ── */}
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : isError ? (
        <ErrorBlock title="Test qurilmalar olinmadi" message={getApiErrorMessage(error)} onRetry={() => refetch()} />
      ) : devices.length > 0 ? (
        <Card className={cn('overflow-hidden py-0 transition-opacity', isFetching && 'opacity-70')}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Holat</TableHead>
                  <TableHead>Qurilma</TableHead>
                  <TableHead>Hisoblagich</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Oxirgi ko'rilgan</TableHead>
                  <TableHead>Cleanup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      {device.online ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                          Online
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-500">
                          Offline
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link to={`/devices/${device.id}`} className="font-medium hover:underline">
                        {device.name ?? device.id}
                      </Link>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{device.id}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        <Cpu className="h-4 w-4" />
                        {device.meter_serial ?? '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">{device.ip ?? '-'}</TableCell>
                    <TableCell>{formatTime(device.last_seen)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-500">
                        <Timer className="h-4 w-4" />
                        <Countdown ts={device.auto_cleanup_at} />
                      </span>
                    </TableCell>
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
        <EmptyBlock
          title="Test qurilma yo'q"
          message="Test token yoki 202032000525 seriali bilan reading kelganda shu yerda chiqadi."
        />
      )}
    </div>
  )
}
