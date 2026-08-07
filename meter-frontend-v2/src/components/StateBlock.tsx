import type { ReactNode } from 'react'
import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function LoadingBlock({ title = 'Yuklanmoqda...', message }: { title?: string; message?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <div>
          <p className="font-medium">{title}</p>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export function EmptyBlock({
  title = "Ma'lumot yo'q",
  message,
  action,
}: {
  title?: string
  message?: string
  action?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-medium">{title}</p>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  )
}

export function ErrorBlock({
  title = 'Xatolik yuz berdi',
  message,
  onRetry,
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        {message && <span>{message}</span>}
        {onRetry && (
          <Button variant="outline" size="sm" className="w-fit" onClick={onRetry}>
            Qayta urinish
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full animate-shimmer-wave rounded-lg" />
      ))}
    </div>
  )
}

export function KPISkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full animate-shimmer-wave rounded-xl" />
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  return <Skeleton className="h-72 w-full animate-shimmer-wave rounded-xl" />
}
