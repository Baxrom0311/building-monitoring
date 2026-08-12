import { cn } from '@/lib/utils'

// Yagona holat "pill" — online/offline/status hamma joyda bir xil ko'rinsin.
// Ilgari 6+ sahifada har xil (ba'zisi inglizcha) yozilardi.

export type StatusTone = 'success' | 'warning' | 'destructive' | 'info' | 'muted'

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
  destructive: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25',
  info: 'bg-primary/10 text-primary border-primary/25',
  muted: 'bg-muted text-muted-foreground border-border',
}

const DOT_CLASSES: Record<StatusTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-red-500',
  info: 'bg-primary',
  muted: 'bg-muted-foreground/50',
}

interface StatusBadgeProps {
  tone?: StatusTone
  label: string
  dot?: boolean
  pulse?: boolean
  className?: string
}

export function StatusBadge({ tone = 'muted', label, dot = true, pulse = false, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', DOT_CLASSES[tone])} />
          )}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', DOT_CLASSES[tone])} />
        </span>
      )}
      {label}
    </span>
  )
}

/** Online/offline uchun qulay yordamchi. */
export function OnlineStatusBadge({ online }: { online: boolean }) {
  return online ? (
    <StatusBadge tone="success" label="Onlayn" pulse />
  ) : (
    <StatusBadge tone="muted" label="Oflayn" />
  )
}
