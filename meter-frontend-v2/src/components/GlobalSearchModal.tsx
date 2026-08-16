import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  Bell,
  Building2,
  Cpu,
  FileSpreadsheet,
  Gauge,
  Home,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useBuildings, useDevicesList } from '@/hooks/queries'
import { translitIncludes } from '@/lib/translit'

interface GlobalSearchModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const NAV_ITEMS = [
  { label: 'Boshqaruv paneli (Dashboard)', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Binolar', path: '/buildings', icon: Building2 },
  { label: 'Qurilmalar', path: '/devices', icon: Cpu },
  { label: 'Analitika va grafiklar', path: '/analytics', icon: Activity },
  { label: 'Ogohlantirishlar', path: '/alerts', icon: Bell },
  { label: 'Kommunal hisobotlar (Billing)', path: '/billing', icon: FileSpreadsheet },
  { label: 'Xonadonlar va Mahalla (Territory)', path: '/territory', icon: Home },
  { label: 'Displey Ekran', path: '/display', icon: Gauge },
  { label: 'AI Chat yordamchi', path: '/chat', icon: MessageSquare },
  { label: 'Sozlamalar', path: '/settings', icon: Settings },
  { label: 'Foydalanuvchilar', path: '/users', icon: Users },
]

export function GlobalSearchModal({ open: externalOpen, onOpenChange }: GlobalSearchModalProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen
  const setOpen = (value: boolean) => {
    if (onOpenChange) onOpenChange(value)
    else setInternalOpen(value)
  }

  // Fetch data for instant search
  const { data: buildingsData } = useBuildings()
  const { data: devicesData } = useDevicesList({ page: 1, pageSize: 100 })

  const buildings = buildingsData ?? []
  const devices = devicesData?.devices ?? []

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!isOpen)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [isOpen])

  const handleSelect = (path: string) => {
    setOpen(false)
    setQuery('')
    navigate(path)
  }

  // Filter items using Uzbek Latin-Cyrillic script agnostic search
  const filteredNav = NAV_ITEMS.filter(
    (item) => !query.trim() || translitIncludes(item.label, query),
  )

  const filteredBuildings = buildings.filter(
    (b) =>
      !query.trim() ||
      translitIncludes(b.name, query) ||
      translitIncludes(b.address, query) ||
      translitIncludes(b.mahalla_name, query),
  ).slice(0, 8)

  const filteredDevices = devices.filter(
    (d) =>
      !query.trim() ||
      translitIncludes(d.name, query) ||
      translitIncludes(d.id, query) ||
      translitIncludes(d.meter_serial, query) ||
      translitIncludes(d.building, query),
  ).slice(0, 8)

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Izlash... (Lotin/Kirill farqsiz: e.g. 'Urganch', 'Электр', '12-bino')..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[380px] overflow-y-auto p-2">
        <CommandEmpty>Natija topilmadi</CommandEmpty>

        {filteredNav.length > 0 && (
          <CommandGroup heading="Sahifalar">
            {filteredNav.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.path}
                  onSelect={() => handleSelect(item.path)}
                  className="cursor-pointer flex items-center gap-2 py-2 px-3 text-sm rounded-md"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        {filteredBuildings.length > 0 && (
          <CommandGroup heading="Binolar">
            {filteredBuildings.map((b) => (
              <CommandItem
                key={b.id}
                onSelect={() => handleSelect(`/buildings/${b.id}`)}
                className="cursor-pointer flex items-center gap-2 py-2 px-3 text-sm rounded-md"
              >
                <Building2 className="h-4 w-4 text-blue-500" />
                <div className="flex flex-col">
                  <span className="font-medium">{b.name}</span>
                  {b.address && <span className="text-xs text-muted-foreground">{b.address}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {filteredDevices.length > 0 && (
          <CommandGroup heading="Qurilmalar">
            {filteredDevices.map((d) => (
              <CommandItem
                key={d.id}
                onSelect={() => handleSelect(`/devices/${d.id}`)}
                className="cursor-pointer flex items-center gap-2 py-2 px-3 text-sm rounded-md"
              >
                <Cpu className="h-4 w-4 text-emerald-500" />
                <div className="flex flex-col">
                  <span className="font-medium">{d.name || d.id}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.utility_type?.toUpperCase()} — {d.building || 'Bino biriktirilmagan'}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
