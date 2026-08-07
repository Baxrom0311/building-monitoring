interface StatusPulseProps {
  status?: 'online' | 'offline' | 'warning' | 'active' | boolean
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

export function StatusPulse({
  status = 'online',
  size = 'md',
  label,
  className = '',
}: StatusPulseProps) {
  const isOnline = status === 'online' || status === 'active' || status === true
  const isWarning = status === 'warning'

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3.5 w-3.5',
  }

  const dotSize = sizeClasses[size]

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex items-center justify-center">
        {isOnline && (
          <>
            <span className={`absolute inline-flex ${dotSize} rounded-full bg-emerald-400 opacity-75 animate-ping`} />
            <span className={`relative inline-flex ${dotSize} rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]`} />
          </>
        )}
        {isWarning && (
          <>
            <span className={`absolute inline-flex ${dotSize} rounded-full bg-amber-400 opacity-75 animate-ping`} />
            <span className={`relative inline-flex ${dotSize} rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]`} />
          </>
        )}
        {!isOnline && !isWarning && (
          <span className={`relative inline-flex ${dotSize} rounded-full bg-muted-foreground/40`} />
        )}
      </span>
      {label && <span className="text-xs font-medium">{label}</span>}
    </div>
  )
}
