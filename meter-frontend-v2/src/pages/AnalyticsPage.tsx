import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Calendar, Download, FileSpreadsheet, Printer } from 'lucide-react'
import { useBuildings, useEnergyAnalytics, useHourlyStats } from '@/hooks/queries'
import { MetricBarChart } from '@/components/charts/MetricBarChart'
import { getApiErrorMessage } from '@/lib/errors'
import { notifySuccess } from '@/lib/toast'
import { ChartSkeleton, EmptyBlock, ErrorBlock, TableSkeleton } from '@/components/StateBlock'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

type UtilityFilter = 'all' | 'electricity' | 'water' | 'gas' | 'soil' | 'sound'
type Granularity = 'hour' | 'day' | 'month'

const UTILITY_FILTER_LABELS: Record<UtilityFilter, string> = {
  all: 'Barchasi',
  electricity: 'Elektr',
  water: 'Suv',
  gas: 'Gaz',
  soil: "Yerto'la",
  sound: 'Ovoz',
}

// Chart seriya ranglari (eski sahifadagi palitra saqlangan)
const COLORS = {
  energy: '#3B82F6',
  power: '#10B981',
  voltage: '#3B82F6',
  waterPressure: '#06B6D4',
  waterPressureTop: '#8B5CF6',
  waterFlow: '#3B82F6',
  waterVolume: '#EC4899',
  gasPressure: '#14B8A6',
  gasFlow: '#F59E0B',
  gasVolume: '#10B981',
  humidity: '#22C55E',
  level: '#A855F7',
}

// Har bir kommunal tur uchun mini-grafik paneli (small multiples)
const UTILITY_PANELS: {
  key: Exclude<UtilityFilter, 'all'>
  title: string
  subtitle: string
  series: { key: string; name: string; color: string }[]
}[] = [
  {
    key: 'electricity',
    title: 'Elektr',
    subtitle: 'Kuchlanish va quvvat',
    series: [
      { key: 'voltage', name: 'Voltage L1 (V)', color: COLORS.voltage },
      { key: 'power', name: 'Power (W)', color: COLORS.power },
    ],
  },
  {
    key: 'water',
    title: 'Suv',
    subtitle: 'Bosim, oqim va hajm',
    series: [
      { key: 'waterPressure', name: 'Pastki bosim (bar)', color: COLORS.waterPressure },
      { key: 'waterPressureTop', name: 'Yuqori bosim (bar)', color: COLORS.waterPressureTop },
      { key: 'waterFlow', name: 'Oqim (L/min)', color: COLORS.waterFlow },
    ],
  },
  {
    key: 'gas',
    title: 'Gaz',
    subtitle: 'Bosim va oqim',
    series: [
      { key: 'gasPressure', name: 'Bosim (bar)', color: COLORS.gasPressure },
      { key: 'gasFlow', name: 'Oqim (m³/h)', color: COLORS.gasFlow },
    ],
  },
  {
    key: 'soil',
    title: "Yerto'la namligi",
    subtitle: "O'rtacha namlik foizi",
    series: [{ key: 'humidity', name: 'Namlik (%)', color: COLORS.humidity }],
  },
  {
    key: 'sound',
    title: 'Ovoz darajasi',
    subtitle: "O'rtacha intensivlik",
    series: [{ key: 'level', name: 'Daraja (%)', color: COLORS.level }],
  },
]

interface HourlyRow {
  bucket_ts: number
  label: string
  samples: number
  voltage: number
  power: number
  waterPressure: number
  waterPressureTop: number
  waterFlow: number
  waterVolume: number
  gasPressure: number
  gasFlow: number
  gasVolume: number
  humidity: number
  level: number
  pressure: number
  pressureTop: number
  flow: number
  volume: number
}

export default function AnalyticsPage() {
  const { data: buildings } = useBuildings()

  // Filtrlar
  const [buildingId, setBuildingId] = useState<string>('all')
  const [utilityType, setUtilityType] = useState<UtilityFilter>('all')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [dateRange, setDateRange] = useState<string>('7d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Sana oralig'idan unix timestamp hisoblash
  const { fromTs, toTs } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    let start = now - 7 * 24 * 60 * 60 // Default 7 kun
    if (dateRange === '24h') {
      start = now - 24 * 60 * 60
    } else if (dateRange === '30d') {
      start = now - 30 * 24 * 60 * 60
    } else if (dateRange === 'custom') {
      // 'YYYY-MM-DD' ni lokal vaqt sifatida parse qilamiz (new Date(string) UTC deb oladi)
      const parseLocalDate = (value: string) => {
        const [y, m, d] = value.split('-').map(Number)
        return Math.floor(new Date(y, m - 1, d).getTime() / 1000)
      }
      const sDate = customStart ? parseLocalDate(customStart) : now - 7 * 24 * 60 * 60
      // Tugash kunini to'liq qamrab olish uchun kun oxirigacha (+86399s)
      const eDate = customEnd ? parseLocalDate(customEnd) + 86399 : now
      return { fromTs: sDate, toTs: eDate }
    }
    return { fromTs: start, toTs: now }
  }, [dateRange, customStart, customEnd])

  const bId = buildingId !== 'all' ? parseInt(buildingId) : undefined
  const hourlyHours = dateRange === '24h' ? 24 : dateRange === '30d' ? 720 : 168

  const {
    data: analyticsData,
    isLoading,
    isError,
    error: analyticsError,
    refetch,
  } = useEnergyAnalytics(granularity, fromTs, toTs, bId)
  const {
    data: hourlyStats,
    isLoading: hourlyLoading,
    isError: hourlyIsError,
    error: hourlyError,
    refetch: refetchHourly,
  } = useHourlyStats(hourlyHours, bId, utilityType)

  // Energiya analitikasi — grafik/jadval uchun formatlash (vaqt bo'yicha o'sish tartibida)
  const formattedData = useMemo(() => {
    if (!analyticsData?.data) return []
    return [...analyticsData.data]
      .sort((a, b) => a.bucket_ts - b.bucket_ts)
      .map((p) => {
        let label: string
        try {
          const d = new Date(p.bucket_ts * 1000)
          if (granularity === 'hour') {
            label = d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
          } else if (granularity === 'day') {
            label = d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' })
          } else {
            label = d.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'short' })
          }
        } catch {
          label = p.bucket_ts.toString()
        }

        return {
          timestamp: p.bucket_ts,
          label,
          energy: p.energy_kwh_delta ?? 0,
          power: p.avg_power_w ?? 0,
          samples: p.samples ?? 0,
        }
      })
  }, [analyticsData, granularity])

  const hourlyChartData = useMemo<HourlyRow[]>(() => {
    if (!hourlyStats?.stats) return []
    const buckets = new Map<
      number,
      Omit<HourlyRow, 'pressure' | 'pressureTop' | 'flow' | 'volume'> & {
        elecSamples: number
        waterSamples: number
        gasSamples: number
        soilSamples: number
        soundSamples: number
      }
    >()

    // Har bir utility_type bo'yicha alohida agregatsiya — aralash o'rtacha (diluted average) bo'lmasligi uchun
    ;[...hourlyStats.stats]
      .sort((a, b) => a.bucket_ts - b.bucket_ts)
      .forEach((row) => {
        const current = buckets.get(row.bucket_ts) ?? {
          bucket_ts: row.bucket_ts,
          label: new Date(row.bucket_ts * 1000).toLocaleString('uz-UZ', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
          }),
          voltage: 0,
          power: 0,
          waterPressure: 0,
          waterPressureTop: 0,
          waterFlow: 0,
          waterVolume: 0,
          gasPressure: 0,
          gasFlow: 0,
          gasVolume: 0,
          humidity: 0,
          level: 0,
          samples: 0,
          elecSamples: 0,
          waterSamples: 0,
          gasSamples: 0,
          soilSamples: 0,
          soundSamples: 0,
        }
        const samples = Math.max(row.samples || 1, 1)
        current.samples += samples
        if (row.utility_type === 'electricity') {
          current.voltage += (row.avg_voltage_l1 ?? 0) * samples
          current.power += (row.avg_power_w ?? 0) * samples
          current.elecSamples += samples
        } else if (row.utility_type === 'water') {
          current.waterPressure += (row.avg_pressure_bottom_bar ?? row.avg_pressure_bar ?? 0) * samples
          current.waterPressureTop += (row.avg_pressure_top_bar ?? 0) * samples
          current.waterFlow += (row.avg_flow_rate ?? 0) * samples
          current.waterVolume = Math.max(current.waterVolume, row.max_volume_m3 ?? 0)
          current.waterSamples += samples
        } else if (row.utility_type === 'gas') {
          current.gasPressure += (row.avg_pressure_bottom_bar ?? row.avg_pressure_bar ?? 0) * samples
          current.gasFlow += (row.avg_flow_rate ?? 0) * samples
          current.gasVolume = Math.max(current.gasVolume, row.max_volume_m3 ?? 0)
          current.gasSamples += samples
        } else if (row.utility_type === 'soil') {
          current.humidity += (row.avg_humidity ?? 0) * samples
          current.soilSamples += samples
        } else if (row.utility_type === 'sound') {
          current.level += (row.avg_level ?? 0) * samples
          current.soundSamples += samples
        }
        buckets.set(row.bucket_ts, current)
      })

    return Array.from(buckets.values()).map((row) => {
      const waterPressure = row.waterSamples ? Number((row.waterPressure / row.waterSamples).toFixed(3)) : 0
      const waterPressureTop = row.waterSamples
        ? Number((row.waterPressureTop / row.waterSamples).toFixed(3))
        : 0
      const waterFlow = row.waterSamples ? Number((row.waterFlow / row.waterSamples).toFixed(3)) : 0
      const waterVolume = Number(row.waterVolume.toFixed(3))
      const gasPressure = row.gasSamples ? Number((row.gasPressure / row.gasSamples).toFixed(3)) : 0
      const gasFlow = row.gasSamples ? Number((row.gasFlow / row.gasSamples).toFixed(3)) : 0
      const gasVolume = Number(row.gasVolume.toFixed(3))
      return {
        bucket_ts: row.bucket_ts,
        label: row.label,
        samples: row.samples,
        voltage: row.elecSamples ? Number((row.voltage / row.elecSamples).toFixed(2)) : 0,
        power: row.elecSamples ? Number((row.power / row.elecSamples).toFixed(1)) : 0,
        waterPressure,
        waterPressureTop,
        waterFlow,
        waterVolume,
        gasPressure,
        gasFlow,
        gasVolume,
        humidity: row.soilSamples ? Number((row.humidity / row.soilSamples).toFixed(1)) : 0,
        level: row.soundSamples ? Number((row.level / row.soundSamples).toFixed(1)) : 0,
        // Bitta utility tanlanganda jadval/eksport uchun eski nomlar saqlanadi
        pressure: utilityType === 'gas' ? gasPressure : waterPressure,
        pressureTop: waterPressureTop,
        flow: utilityType === 'gas' ? gasFlow : waterFlow,
        volume: utilityType === 'gas' ? gasVolume : waterVolume,
      }
    })
  }, [hourlyStats, utilityType])

  // CSV eksport (tanlangan utility turiga qarab dinamik ustunlar)
  const handleExportCSV = () => {
    let headers: string[] = []
    let rows: (string | number)[][] = []

    if (utilityType === 'electricity') {
      headers = [
        'Vaqt (Timestamp)',
        'Sana (Label)',
        'Energiya sarfi (kWh)',
        "O'rtacha Quvvat (W)",
        'Kuchlanish L1 (V)',
        "O'lchovlar soni",
      ]
      rows = hourlyChartData.map((row) => {
        const energyRow = formattedData.find((e) => Math.abs(e.timestamp - row.bucket_ts) < 1800)
        return [
          row.bucket_ts,
          `"${row.label}"`,
          energyRow ? energyRow.energy.toFixed(2) : '0.00',
          row.power.toFixed(1),
          row.voltage.toFixed(1),
          row.samples,
        ]
      })
    } else if (utilityType === 'water') {
      headers = [
        'Vaqt (Timestamp)',
        'Sana (Label)',
        'Pastki bosim (bar)',
        'Yuqori bosim (bar)',
        'Oqim (L/min)',
        'Jami hajm (m³)',
        "O'lchovlar soni",
      ]
      rows = hourlyChartData.map((row) => [
        row.bucket_ts,
        `"${row.label}"`,
        row.pressure.toFixed(3),
        row.pressureTop.toFixed(3),
        row.flow.toFixed(3),
        row.volume.toFixed(3),
        row.samples,
      ])
    } else if (utilityType === 'gas') {
      headers = [
        'Vaqt (Timestamp)',
        'Sana (Label)',
        'Bosim (bar)',
        'Oqim (m³/soat)',
        'Jami hajm (m³)',
        "O'lchovlar soni",
      ]
      rows = hourlyChartData.map((row) => [
        row.bucket_ts,
        `"${row.label}"`,
        row.pressure.toFixed(3),
        row.flow.toFixed(3),
        row.volume.toFixed(3),
        row.samples,
      ])
    } else if (utilityType === 'soil') {
      headers = ['Vaqt (Timestamp)', 'Sana (Label)', 'Namlik (%)', "O'lchovlar soni"]
      rows = hourlyChartData.map((row) => [row.bucket_ts, `"${row.label}"`, row.humidity.toFixed(1), row.samples])
    } else if (utilityType === 'sound') {
      headers = ['Vaqt (Timestamp)', 'Sana (Label)', 'Ovoz darajasi (%)', "O'lchovlar soni"]
      rows = hourlyChartData.map((row) => [row.bucket_ts, `"${row.label}"`, row.level.toFixed(1), row.samples])
    } else {
      headers = [
        'Vaqt (Timestamp)',
        'Sana (Label)',
        'Quvvat (W)',
        'Kuchlanish (V)',
        'Suv pastki bosim (bar)',
        'Suv yuqori bosim (bar)',
        'Suv/Gaz oqimi',
        'Jami hajm (m³)',
        "O'lchovlar soni",
      ]
      rows = hourlyChartData.map((row) => [
        row.bucket_ts,
        `"${row.label}"`,
        row.power.toFixed(1),
        row.voltage.toFixed(1),
        row.pressure.toFixed(3),
        row.pressureTop.toFixed(3),
        row.flow.toFixed(3),
        row.volume.toFixed(3),
        row.samples,
      ])
    }

    if (rows.length === 0) return
    const csvRows = [headers.join(',')]
    rows.forEach((values) => {
      csvRows.push(values.join(','))
    })

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `analytics_report_${buildingId !== 'all' ? buildingId : 'all'}_${utilityType}_${dateRange}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notifySuccess('CSV hisoboti muvaffaqiyatli eksport qilindi')
  }

  // Excel eksport
  const handleExportExcel = () => {
    const buildingName =
      buildingId !== 'all'
        ? (buildings?.find((b) => b.id.toString() === buildingId)?.name ?? buildingId)
        : 'Barcha binolar'
    const utilLabel = UTILITY_FILTER_LABELS[utilityType]

    const wb = XLSX.utils.book_new()

    // Sheet 1: Energiya analitikasi
    if (formattedData.length > 0 && (utilityType === 'electricity' || utilityType === 'all')) {
      const energySheet = [
        ['METER MONITOR — Elektr sarfi tahlili'],
        [`Bino: ${buildingName}`, `Muddat: ${dateRange}`, `Granularity: ${granularity}`],
        [],
        ['Sana / Vaqt', 'Energiya sarfi (kWh)', "O'rtacha yuklama (W)", "O'lchovlar soni"],
        ...formattedData.map((r) => [r.label, r.energy, r.power, r.samples]),
        [],
        ['JAMI:', formattedData.reduce((s, r) => s + r.energy, 0).toFixed(2) + ' kWh'],
        [
          "O'RTACHA:",
          (formattedData.reduce((s, r) => s + r.power, 0) / (formattedData.length || 1)).toFixed(1) + ' W',
        ],
        ['MAX:', Math.max(...formattedData.map((r) => r.energy)).toFixed(2) + ' kWh'],
      ]
      const ws = XLSX.utils.aoa_to_sheet(energySheet)
      ws['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Elektr sarfi')
    }

    // Sheet 2: Soatlik utility statistikasi
    if (hourlyChartData.length > 0) {
      let headers: string[]
      let dataRows: (string | number)[][]
      if (utilityType === 'electricity' || utilityType === 'all') {
        headers = ['Sana / Vaqt', 'Kuchlanish L1 (V)', "O'rtacha quvvat (W)", "O'lchovlar soni"]
        dataRows = hourlyChartData.map((r) => [r.label, r.voltage, r.power, r.samples])
      } else if (utilityType === 'water') {
        headers = [
          'Sana / Vaqt',
          'Pastki bosim (bar)',
          'Yuqori bosim (bar)',
          'Oqim (L/min)',
          'Jami hajm (m³)',
          "O'lchovlar soni",
        ]
        dataRows = hourlyChartData.map((r) => [r.label, r.pressure, r.pressureTop, r.flow, r.volume, r.samples])
      } else if (utilityType === 'soil') {
        headers = ['Sana / Vaqt', 'Namlik (%)', "O'lchovlar soni"]
        dataRows = hourlyChartData.map((r) => [r.label, r.humidity, r.samples])
      } else if (utilityType === 'sound') {
        headers = ['Sana / Vaqt', 'Ovoz darajasi (%)', "O'lchovlar soni"]
        dataRows = hourlyChartData.map((r) => [r.label, r.level, r.samples])
      } else {
        headers = ['Sana / Vaqt', 'Bosim (bar)', 'Oqim (m³/h)', 'Jami hajm (m³)', "O'lchovlar soni"]
        dataRows = hourlyChartData.map((r) => [r.label, r.pressure, r.flow, r.volume, r.samples])
      }
      const ws2 = XLSX.utils.aoa_to_sheet([
        [`METER MONITOR — ${utilLabel} monitoring`],
        [`Bino: ${buildingName}`, `Muddat: ${dateRange}`],
        [],
        headers,
        ...dataRows,
      ])
      ws2['!cols'] = headers.map((_, i) => ({ wch: i === 0 ? 22 : 18 }))
      XLSX.utils.book_append_sheet(wb, ws2, `${utilLabel} monitoring`)
    }

    XLSX.writeFile(wb, `meter_monitor_${buildingId !== 'all' ? buildingId : 'all'}_${utilityType}_${dateRange}.xlsx`)
    notifySuccess('Excel hisoboti muvaffaqiyatli eksport qilindi')
  }

  // Xulosa statistikasi
  const summaryStats = useMemo(() => {
    if (utilityType === 'electricity' || utilityType === 'all') {
      if (formattedData.length === 0) return null
      const total = formattedData.reduce((s, r) => s + r.energy, 0)
      const avgPower = formattedData.reduce((s, r) => s + r.power, 0) / formattedData.length
      const maxEnergy = Math.max(...formattedData.map((r) => r.energy))
      const minEnergy = Math.min(...formattedData.filter((r) => r.energy > 0).map((r) => r.energy))
      return [
        { label: 'Jami sarflangan', value: total.toFixed(2), unit: 'kWh' },
        { label: "O'rtacha quvvat", value: avgPower.toFixed(1), unit: 'W' },
        { label: 'Eng yuqori', value: maxEnergy.toFixed(2), unit: 'kWh' },
        { label: 'Eng past', value: isFinite(minEnergy) ? minEnergy.toFixed(2) : '—', unit: 'kWh' },
      ]
    } else if (utilityType === 'water') {
      if (hourlyChartData.length === 0) return null
      const maxVol = Math.max(...hourlyChartData.map((r) => r.volume))
      const avgPressure = hourlyChartData.reduce((s, r) => s + r.pressure, 0) / hourlyChartData.length
      const avgFlow = hourlyChartData.reduce((s, r) => s + r.flow, 0) / hourlyChartData.length
      return [
        { label: 'Jami hajm', value: maxVol.toFixed(2), unit: 'm³' },
        { label: "O'rtacha oqim", value: avgFlow.toFixed(3), unit: 'L/min' },
        { label: "O'rtacha bosim", value: avgPressure.toFixed(3), unit: 'bar' },
        { label: "O'lchovlar", value: hourlyChartData.reduce((s, r) => s + r.samples, 0).toString(), unit: 'ta' },
      ]
    } else if (utilityType === 'gas') {
      if (hourlyChartData.length === 0) return null
      const maxVol = Math.max(...hourlyChartData.map((r) => r.volume))
      const avgFlow = hourlyChartData.reduce((s, r) => s + r.flow, 0) / hourlyChartData.length
      const avgPressure = hourlyChartData.reduce((s, r) => s + r.pressure, 0) / hourlyChartData.length
      return [
        { label: 'Jami hajm', value: maxVol.toFixed(2), unit: 'm³' },
        { label: "O'rtacha oqim", value: avgFlow.toFixed(3), unit: 'm³/h' },
        { label: "O'rtacha bosim", value: avgPressure.toFixed(3), unit: 'bar' },
        { label: "O'lchovlar", value: hourlyChartData.reduce((s, r) => s + r.samples, 0).toString(), unit: 'ta' },
      ]
    } else if (utilityType === 'soil') {
      if (hourlyChartData.length === 0) return null
      const avgHum = hourlyChartData.reduce((s, r) => s + r.humidity, 0) / hourlyChartData.length
      const maxHum = Math.max(...hourlyChartData.map((r) => r.humidity))
      const minHum = Math.min(...hourlyChartData.filter((r) => r.humidity > 0).map((r) => r.humidity))
      return [
        { label: "O'rtacha namlik", value: avgHum.toFixed(1), unit: '%' },
        { label: 'Eng yuqori', value: maxHum.toFixed(1), unit: '%' },
        { label: 'Eng past', value: isFinite(minHum) ? minHum.toFixed(1) : '—', unit: '%' },
        { label: "O'lchovlar", value: hourlyChartData.reduce((s, r) => s + r.samples, 0).toString(), unit: 'ta' },
      ]
    } else if (utilityType === 'sound') {
      if (hourlyChartData.length === 0) return null
      const avgLvl = hourlyChartData.reduce((s, r) => s + r.level, 0) / hourlyChartData.length
      const maxLvl = Math.max(...hourlyChartData.map((r) => r.level))
      const minLvl = Math.min(...hourlyChartData.filter((r) => r.level > 0).map((r) => r.level))
      return [
        { label: "O'rtacha daraja", value: avgLvl.toFixed(1), unit: '%' },
        { label: 'Eng yuqori', value: maxLvl.toFixed(1), unit: '%' },
        { label: 'Eng past', value: isFinite(minLvl) ? minLvl.toFixed(1) : '—', unit: '%' },
        { label: "O'lchovlar", value: hourlyChartData.reduce((s, r) => s + r.samples, 0).toString(), unit: 'ta' },
      ]
    }
    return null
  }, [formattedData, hourlyChartData, utilityType])

  const showEnergyTable = utilityType === 'electricity' || utilityType === 'all'
  const tableRowCount = showEnergyTable ? formattedData.length : hourlyChartData.length

  return (
    <div className="space-y-6">
      {/* Sahifa kirish qatori */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kommunal sarf tahlili</h1>
          <p className="text-sm text-muted-foreground">
            Energiya va kommunal ko'rsatkichlar bo'yicha hisobotlar
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={hourlyChartData.length === 0}>
            <Printer className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={hourlyChartData.length === 0}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button
            size="sm"
            onClick={handleExportExcel}
            disabled={formattedData.length === 0 && hourlyChartData.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      {/* Filtrlar */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>Bino</Label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Barcha binolar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha binolar</SelectItem>
                {buildings?.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Kommunal tur</Label>
            <Select value={utilityType} onValueChange={(v) => setUtilityType(v as UtilityFilter)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                <SelectItem value="electricity">Elektr</SelectItem>
                <SelectItem value="water">Suv</SelectItem>
                <SelectItem value="gas">Gaz</SelectItem>
                <SelectItem value="soil">Yerto'la namligi</SelectItem>
                <SelectItem value="sound">Ovoz</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Granulyarlik</Label>
            <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hour">Soatlik</SelectItem>
                <SelectItem value="day">Kunlik</SelectItem>
                <SelectItem value="month">Oylik</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sana oralig'i</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Oxirgi 24 soat</SelectItem>
                <SelectItem value="7d">Oxirgi 7 kun</SelectItem>
                <SelectItem value="30d">Oxirgi 30 kun</SelectItem>
                <SelectItem value="custom">Boshqa muddat...</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Maxsus sana oralig'i */}
      {dateRange === 'custom' && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-6 p-5">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Boshlanish
              </Label>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Tugash
              </Label>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
          <TableSkeleton rows={6} />
        </div>
      ) : isError ? (
        <ErrorBlock message={getApiErrorMessage(analyticsError)} onRetry={() => refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* Xulosa kartalari */}
          {summaryStats && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {summaryStats.map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="font-mono text-2xl font-semibold">{stat.value}</span>
                      <span className="text-xs text-muted-foreground">{stat.unit}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Energiya grafiklari faqat formattedData mavjud bo'lganda chiziladi */}
          {formattedData.length > 0 ? (
            <>
              {/* Energiya sarfi (ustunli) */}
              <Card>
                <CardHeader>
                  <CardTitle>KWh sarfi</CardTitle>
                  <CardDescription>Tanlangan interval bo'yicha energiya delta</CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricBarChart
                    data={formattedData}
                    xKey="label"
                    height={300}
                    maxBars={31}
                    unit="kWh"
                    series={[{ key: 'energy', name: 'Energiya (kWh)', color: COLORS.energy }]}
                  />
                </CardContent>
              </Card>

              {/* O'rtacha quvvat (ustunli) */}
              <Card>
                <CardHeader>
                  <CardTitle>O'rtacha yuklama quvvati</CardTitle>
                  <CardDescription>Power W trend chizig'i</CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricBarChart
                    data={formattedData}
                    xKey="label"
                    height={300}
                    maxBars={31}
                    unit="W"
                    series={[{ key: 'power', name: 'Quvvat (W)', color: COLORS.power }]}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            (utilityType === 'electricity' || utilityType === 'all') && (
              <EmptyBlock title="Ma'lumot yo'q" message="Ushbu sana oralig'ida o'lchovlar topilmadi" />
            )
          )}

          {/* Multi-series utility monitoring */}
          {hourlyLoading ? (
            <ChartSkeleton />
          ) : hourlyIsError ? (
            <ErrorBlock
              title="Utility statistikasi olinmadi"
              message={getApiErrorMessage(hourlyError)}
              onRetry={() => refetchHourly()}
            />
          ) : hourlyChartData.length > 0 ? (
            // Har bir kommunal tur o'z mini-grafigida — bitta grafikka 10+ seriya
            // tiqilishi o'qib bo'lmas edi (small multiples yondashuvi)
            <div className="grid gap-4 lg:grid-cols-2">
              {UTILITY_PANELS.filter(
                (panel) => utilityType === 'all' || utilityType === panel.key,
              ).map((panel) => {
                const hasValues = hourlyChartData.some((row) =>
                  panel.series.some((s) => Number(row[s.key as keyof HourlyRow]) > 0),
                )
                if (!hasValues) return null
                return (
                  <Card key={panel.key} className={utilityType !== 'all' ? 'lg:col-span-2' : undefined}>
                    <CardHeader>
                      <CardTitle className="text-base">{panel.title}</CardTitle>
                      <CardDescription>{panel.subtitle}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <MetricBarChart
                        data={hourlyChartData}
                        xKey="label"
                        height={utilityType === 'all' ? 220 : 300}
                        maxBars={24}
                        series={panel.series}
                      />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <EmptyBlock
              title="Utility statistikasi yo'q"
              message="Tanlangan filtr uchun hourly statistika topilmadi."
            />
          )}

          {/* Tahliliy hisobot jadvali */}
          {tableRowCount > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Tahliliy hisobot jadvali</CardTitle>
                <span className="text-xs text-muted-foreground">Jami: {tableRowCount} ta yozuv</span>
              </CardHeader>
              <CardContent>
                {showEnergyTable ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sana / Vaqt</TableHead>
                        <TableHead className="text-right">Sarflangan energiya (kWh)</TableHead>
                        <TableHead className="text-right">O'rtacha yuklama (W)</TableHead>
                        <TableHead className="text-right">O'lchovlar soni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formattedData.map((row) => (
                        <TableRow key={row.timestamp}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right font-mono">{row.energy.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono">{row.power.toFixed(1)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {row.samples}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : utilityType === 'water' ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sana / Vaqt</TableHead>
                        <TableHead className="text-right">Pastki bosim (bar)</TableHead>
                        <TableHead className="text-right">Yuqori bosim (bar)</TableHead>
                        <TableHead className="text-right">Suv oqimi (L/min)</TableHead>
                        <TableHead className="text-right">Jami hajm (m³)</TableHead>
                        <TableHead className="text-right">O'lchovlar soni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hourlyChartData.map((row) => (
                        <TableRow key={row.bucket_ts}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right font-mono">{row.pressure.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono">{row.pressureTop.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono">{row.flow.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono">{row.volume.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {row.samples}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : utilityType === 'soil' ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sana / Vaqt</TableHead>
                        <TableHead className="text-right">Namlik (%)</TableHead>
                        <TableHead className="text-right">O'lchovlar soni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hourlyChartData.map((row) => (
                        <TableRow key={row.bucket_ts}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right font-mono">{row.humidity.toFixed(1)}%</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {row.samples}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : utilityType === 'sound' ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sana / Vaqt</TableHead>
                        <TableHead className="text-right">Ovoz darajasi (%)</TableHead>
                        <TableHead className="text-right">O'lchovlar soni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hourlyChartData.map((row) => (
                        <TableRow key={row.bucket_ts}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right font-mono">{row.level.toFixed(1)}%</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {row.samples}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sana / Vaqt</TableHead>
                        <TableHead className="text-right">Gaz bosimi (bar)</TableHead>
                        <TableHead className="text-right">Gaz oqimi (m³/h)</TableHead>
                        <TableHead className="text-right">Jami hajm (m³)</TableHead>
                        <TableHead className="text-right">O'lchovlar soni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hourlyChartData.map((row) => (
                        <TableRow key={row.bucket_ts}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right font-mono">{row.pressure.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono">{row.flow.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono">{row.volume.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {row.samples}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
