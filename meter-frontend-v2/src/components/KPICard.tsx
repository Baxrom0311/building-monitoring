import type { LucideIcon } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { SpotlightCard } from '@/components/ui/SpotlightCard'
import { cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  tone?: 'default' | 'success' | 'warning' | 'destructive'
}

const toneClasses: Record<NonNullable<KPICardProps['tone']>, string> = {
  default: 'text-primary bg-primary/10',
  success: 'text-emerald-500 bg-emerald-500/10',
  warning: 'text-amber-500 bg-amber-500/10',
  destructive: 'text-red-500 bg-red-500/10',
}

const toneSpotlights: Record<NonNullable<KPICardProps['tone']>, string> = {
  default: 'rgba(59, 130, 246, 0.12)',
  success: 'rgba(16, 185, 129, 0.12)',
  warning: 'rgba(245, 158, 11, 0.12)',
  destructive: 'rgba(239, 68, 68, 0.12)',
}

export function KPICard({ title, value, subtitle, icon: Icon, tone = 'default' }: KPICardProps) {
  return (
    <SpotlightCard spotlightColor={toneSpotlights[tone]}>
      <CardContent className="flex items-center gap-4 p-5">
        {Icon && (
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/50 shadow-xs', toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
          <p className="font-mono text-2xl font-semibold tracking-tight">
            {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
          </p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </SpotlightCard>
  )
}
