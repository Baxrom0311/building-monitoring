import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, ChevronDown, MessageSquare, Send, Sparkles, Trash2 } from 'lucide-react'
import { getTokenFromStorage, removeTokenFromStorage } from '@/lib/auth'
import { API_BASE_URL } from '@/lib/env'
import { notify, queuePendingToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Message {
  role: 'user' | 'model'
  content: string
  thoughts?: string
}

const QUICK_PROMPTS = [
  { text: 'Tizim holati', prompt: "Tizimning umumiy holatini ko'rsat: nechta qurilma online, ogohlantirishlar bormi?" },
  { text: 'Faol ogohlantirishlar', prompt: "Hozirgi tizimdagi barcha faol ogohlantirishlarni ro'yxatini chiqar" },
  { text: 'Binolar va qurilmalar', prompt: "Barcha binolar va ularga ulangan qurilmalar ro'yxatini chiqar" },
  { text: 'Elektr sarfi tahlili', prompt: "Qaysi binolar eng ko'p elektr sarflamoqda? So'nggi 30 kunlik ma'lumot" },
  { text: 'Suv bosimi holati', prompt: "Suv bosim qurilmalari holatini ko'rsat, anomaliyalar bormi?" },
  { text: 'Oflayn qurilmalar', prompt: "Qaysi qurilmalar hozirda oflayn? Ro'yxat va oxirgi ko'ringan vaqtlari" },
]

// Markdown-ish content, rendered simply: code fences become <pre>,
// everything else is preserved with whitespace-pre-wrap. No raw HTML injection.
function MessageContent({ text }: { text: string }) {
  const parts = text.split(/```/)
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {parts.map((part, idx) =>
        idx % 2 === 1 ? (
          <pre
            key={idx}
            className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs"
          >
            {part.replace(/^[a-z]*\n/, '')}
          </pre>
        ) : (
          part.trim() !== '' && (
            <div key={idx} className="whitespace-pre-wrap break-words">
              {part}
            </div>
          )
        ),
      )}
    </div>
  )
}

function ThoughtsBlock({ thoughts, streaming }: { thoughts: string; streaming?: boolean }) {
  const [open, setOpen] = useState(Boolean(streaming))
  return (
    <Collapsible open={streaming ? true : open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-amber-500 hover:underline"
        >
          <Bot className={cn('h-4 w-4', streaming && 'animate-pulse')} />
          Fikrlash jarayoni
          <ChevronDown className={cn('h-4 w-4 transition-transform', (streaming || open) && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 whitespace-pre-wrap rounded-md border-l-2 border-amber-500 bg-amber-500/5 p-2.5 text-xs italic text-amber-500">
          {thoughts}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function ChatPage() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Message[]>([])
  const [provider, setProvider] = useState('gemini')
  const [isLoading, setIsLoading] = useState(false)
  const [thoughts, setThoughts] = useState('')
  const [partialResponse, setPartialResponse] = useState('')
  const [userIsScrollingUp, setUserIsScrollingUp] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Sahifadan chiqilganda streaming so'rovni bekor qilamiz (unmountdan keyin setState bo'lmasin)
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // Detect user scroll to prevent force scroll-down during streaming
  const handleScrollCapture = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    if (!el || typeof el.scrollHeight !== 'number') return
    const threshold = 40
    const isAtBottom = el.scrollHeight - el.clientHeight - el.scrollTop < threshold
    setUserIsScrollingUp(!isAtBottom)
  }

  const scrollToBottom = useCallback(() => {
    if (!userIsScrollingUp && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [userIsScrollingUp])

  useEffect(() => {
    scrollToBottom()
  }, [history, partialResponse, thoughts, scrollToBottom])

  const submitMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return

    const newMsg: Message = { role: 'user', content: textToSend }
    setHistory((prev) => [...prev, newMsg])
    setMessage('')
    setIsLoading(true)
    setThoughts('')
    setPartialResponse('')
    setUserIsScrollingUp(false)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = getTokenFromStorage()
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          message: textToSend,
          history: history.map((h) => ({ role: h.role, content: h.content })),
          provider,
        }),
      })

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`
        try {
          const body = await response.json()
          if (typeof body.detail === 'string') errMessage = body.detail
          else if (typeof body.message === 'string') errMessage = body.message
        } catch {
          // Non-JSON error responses still get a status-specific message below.
        }

        if (response.status === 401) {
          removeTokenFromStorage()
          queuePendingToast({
            type: 'warning',
            title: 'Sessiya tugadi',
            message: 'Xavfsizlik uchun qaytadan login qiling.',
          })
          navigate('/login', { replace: true })
          return
        }

        if (response.status === 403) {
          notify({ type: 'warning', title: 'Ruxsat yetarli emas', message: errMessage })
        } else if (response.status >= 500) {
          notify({ type: 'error', title: 'Server bilan muammo', message: errMessage })
        }

        throw new Error(errMessage)
      }

      if (!response.body) throw new Error('Response body is empty')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedThoughts = ''
      let accumulatedResponse = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (dataStr === '[DONE]') continue
            try {
              const data = JSON.parse(dataStr)
              if (data.type === 'THOUGHT') {
                accumulatedThoughts += (accumulatedThoughts ? '\n' : '') + data.content
                setThoughts(accumulatedThoughts)
              } else if (data.type === 'FINAL_RESPONSE') {
                accumulatedResponse += data.content
                setPartialResponse(accumulatedResponse)
              }
            } catch (e) {
              console.error('SSE parsing error', e)
            }
          }
        }
      }

      if (controller.signal.aborted) return
      setHistory((prev) => [
        ...prev,
        { role: 'model', content: accumulatedResponse, thoughts: accumulatedThoughts },
      ])
      setThoughts('')
      setPartialResponse('')
    } catch (err) {
      // Abort qilingan bo'lsa (sahifadan chiqildi) hech narsa qilmaymiz
      if (controller.signal.aborted) return
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      setHistory((prev) => [...prev, { role: 'model', content: `Xatolik yuz berdi: ${msg}` }])
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }

  const handleClear = () => {
    setHistory([])
    setThoughts('')
    setPartialResponse('')
  }

  return (
    <div className="space-y-6">
      {/* ── Intro row ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">AI Yordamchi</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4" />
            Tozalash
          </Button>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Gemini 2.5 Flash</SelectItem>
              <SelectItem value="deepseek">DeepSeek Chat</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Chat box ── */}
      <Card className="flex h-[calc(100vh-220px)] min-h-[420px] flex-col gap-0 overflow-hidden py-0">
        <ScrollArea className="min-h-0 flex-1" onScrollCapture={handleScrollCapture}>
          <div className="space-y-4 p-4 sm:p-6">
            {history.length === 0 && !partialResponse && !thoughts && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  Salom! Men elektr, suv va gaz monitoringi tizimingizning AI yordamchisiman. Qurilmalar
                  holati, ogohlantirishlar, sarflar tahlili va boshqaruv bo'yicha savol yozing.
                </p>
              </div>
            )}

            {history.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex max-w-[85%] flex-col gap-1.5',
                  msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start',
                )}
              >
                {msg.thoughts && <ThoughtsBlock thoughts={msg.thoughts} />}
                <div
                  className={cn(
                    'rounded-lg border px-4 py-3',
                    msg.role === 'user'
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'bg-muted/50',
                  )}
                >
                  <MessageContent text={msg.content} />
                </div>
              </div>
            ))}

            {/* SSE streaming thoughts / partial response */}
            {(thoughts || partialResponse) && (
              <div className="mr-auto flex max-w-[85%] flex-col items-start gap-1.5">
                {thoughts && <ThoughtsBlock thoughts={thoughts} streaming />}
                {partialResponse && (
                  <div className="rounded-lg border bg-muted/50 px-4 py-3">
                    <MessageContent text={partialResponse} />
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Typing indicator */}
        {isLoading && !partialResponse && (
          <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-amber-500 sm:px-6">
            <Bot className="h-4 w-4 animate-pulse" />
            AI fikrlamoqda va o'lchov ko'rsatkichlarini tahlil qilmoqda...
          </div>
        )}

        {/* Input area */}
        <CardContent className="space-y-3 border-t p-4">
          {history.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => (
                <Badge
                  key={p.text}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => void submitMessage(p.prompt)}
                >
                  {p.text}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submitMessage(message)
                }
              }}
              placeholder="Savol yozing (masalan: 'Qaysi qurilmalar offline?', '3-bino suv bosimi qanday?')..."
              rows={1}
              className="max-h-32 min-h-11 flex-1 resize-none"
            />
            <Button
              size="icon"
              className="h-11 w-11 shrink-0"
              disabled={isLoading || !message.trim()}
              onClick={() => void submitMessage(message)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
