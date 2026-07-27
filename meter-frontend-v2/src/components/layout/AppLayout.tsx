import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Bell,
  Building2,
  Cpu,
  Droplets,
  Flame,
  FlaskConical,
  Gauge,
  FileSpreadsheet,
  HardDriveDownload,
  Home,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  ScrollText,
  Settings,
  Sun,
  Users,
  Wifi,
  WifiOff,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { orgUtility } from '@/lib/roles'
import { useTheme } from '@/contexts/ThemeContext'
import { useAlerts } from '@/hooks/queries'
import { disconnectWebSocket, useWebSocketStatus } from '@/lib/websocket'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  adminOnly?: boolean
  badge?: number
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Boshqaruv paneli',
  '/buildings': 'Binolar',
  '/devices': 'Qurilmalar',
  '/devices/test': 'Test qurilmalar',
  '/analytics': 'Analitika',
  '/alerts': 'Ogohlantirishlar',
  '/billing/water': 'Suv hisobotlari',
  '/billing/gas': 'Gaz hisobotlari',
  '/billing/electricity': 'Elektr hisobotlari',
  '/billing': 'Kommunal hisobotlar',
  '/territory': 'Xonadonlar',
  '/firmware': 'Firmware / OTA',
  '/chat': 'AI Chat',
  '/users': 'Foydalanuvchilar',
  '/audit': 'Audit jurnali',
  '/settings': 'Sozlamalar',
}

function AppSidebar({ openAlerts }: { openAlerts: number }) {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const utility = orgUtility(user?.role)

  const groups: NavGroup[] = useMemo(() => {
      // Kommunal idora operatori faqat o'z sahifasini ko'radi
      if (utility) {
        const label =
          utility === 'water' ? 'Suv hisobotlari' : utility === 'gas' ? 'Gaz hisobotlari' : 'Elektr hisobotlari'
        const icon = utility === 'water' ? Droplets : utility === 'gas' ? Flame : Zap
        return [{ label: 'Kommunal', items: [{ label, path: `/billing/${utility}`, icon }] }]
      }
      const allGroups: NavGroup[] = [
        {
          label: 'Monitoring',
          items: [
            { label: 'Boshqaruv paneli', path: '/dashboard', icon: LayoutDashboard },
            { label: 'Binolar', path: '/buildings', icon: Building2 },
            { label: 'Qurilmalar', path: '/devices', icon: Cpu },
            { label: 'Test qurilmalar', path: '/devices/test', icon: FlaskConical, adminOnly: true },
            { label: 'Analitika', path: '/analytics', icon: Activity },
          ],
        },
        {
          label: 'Operatsiyalar',
          items: [
            { label: 'Ogohlantirishlar', path: '/alerts', icon: Bell, badge: openAlerts },
            { label: 'Kommunal hisobotlar', path: '/billing', icon: FileSpreadsheet },
            { label: 'Suv hisobotlari', path: '/billing/water', icon: Droplets },
            { label: 'Gaz hisobotlari', path: '/billing/gas', icon: Flame },
            { label: 'Elektr hisobotlari', path: '/billing/electricity', icon: Zap },
            { label: 'Xonadonlar', path: '/territory', icon: Home },
            { label: 'Firmware / OTA', path: '/firmware', icon: HardDriveDownload },
            { label: 'AI Chat', path: '/chat', icon: MessageSquare },
          ],
        },
        {
          label: 'Admin',
          items: [
            { label: 'Foydalanuvchilar', path: '/users', icon: Users, adminOnly: true },
            { label: 'Audit jurnali', path: '/audit', icon: ScrollText, adminOnly: true },
            { label: 'Sozlamalar', path: '/settings', icon: Settings, adminOnly: true },
          ],
        },
      ]
      return allGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.adminOnly || isAdmin),
        }))
        .filter((group) => group.items.length > 0)
    }, [isAdmin, openAlerts, utility])

  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== '/devices' && path !== '/billing' && location.pathname.startsWith(path + '/'))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Gauge className="h-4 w-4" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">Meter Monitor</p>
            <p className="truncate text-xs text-muted-foreground">Kommunal nazorat</p>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isActive(item.path)} tooltip={item.label}>
                      <Link to={item.path}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  )
}

function WsStatusIndicator() {
  const status = useWebSocketStatus()
  const connected = status === 'connected'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {connected ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-amber-500" />}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {connected ? 'Jonli yangilanish ulangan' : `Jonli yangilanish: ${status}`}
      </TooltipContent>
    </Tooltip>
  )
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const { data: openAlertsData } = useAlerts(false, 1)

  const openAlerts = Array.isArray(openAlertsData) ? openAlertsData.length : 0
  const title =
    PAGE_TITLES[location.pathname] ??
    Object.entries(PAGE_TITLES).find(([p]) => location.pathname.startsWith(p + '/'))?.[1] ??
    'Meter Monitor'

  const handleLogout = () => {
    disconnectWebSocket()
    queryClient.clear() // boshqa akkaunt ma'lumotlari keshda qolmasin
    logout()
    navigate('/login')
  }

  return (
    <SidebarProvider>
      <AppSidebar openAlerts={openAlerts} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <WsStatusIndicator />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Tema almashtirish">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">
                      {(user?.username ?? '?').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm sm:inline">{user?.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="flex flex-col">
                  <span>{user?.username}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user?.role}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  Chiqish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
