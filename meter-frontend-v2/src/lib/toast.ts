import { toast } from 'sonner'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastPayload {
  type?: ToastType
  title: string
  message?: string
  durationMs?: number
}

// Eski API bilan moslik — endi sonner ustida yupqa qatlam
export function notify({ type = 'info', title, message, durationMs }: ToastPayload) {
  const opts = { description: message, duration: durationMs }
  switch (type) {
    case 'success':
      toast.success(title, opts)
      break
    case 'error':
      toast.error(title, opts)
      break
    case 'warning':
      toast.warning(title, opts)
      break
    default:
      toast.info(title, opts)
  }
}

export function notifySuccess(title: string, message?: string) {
  notify({ type: 'success', title, message })
}

export function notifyError(title: string, message?: string) {
  notify({ type: 'error', title, message })
}

// Sahifa reload dan keyin ko'rsatiladigan toast (sessiya tugashi va h.k.)
const PENDING_KEY = 'meter-toast'

export function queuePendingToast(payload: ToastPayload) {
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload))
}

export function flushPendingToast() {
  const raw = window.sessionStorage.getItem(PENDING_KEY)
  if (!raw) return
  window.sessionStorage.removeItem(PENDING_KEY)
  try {
    notify(JSON.parse(raw) as ToastPayload)
  } catch {
    /* yaroqsiz payload — e'tiborsiz */
  }
}
