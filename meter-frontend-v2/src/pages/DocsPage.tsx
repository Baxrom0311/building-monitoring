import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Bell,
  Building2,
  ChevronDown,
  Cpu,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  HardDriveDownload,
  Home,
  LayoutDashboard,
  MessageSquare,
  Presentation,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// ─────────────────────────────────────────────────────────────────────────
// 1-BO'LIM: Dasturdan foydalanish — har bir sahifa nima qiladi
// ─────────────────────────────────────────────────────────────────────────

interface AppSection {
  label: string
  path: string
  icon: LucideIcon
  summary: string
  actions: string[]
}

const APP_SECTIONS: AppSection[] = [
  {
    label: 'Boshqaruv paneli',
    path: '/dashboard',
    icon: LayoutDashboard,
    summary:
      "Tizimning umumiy holati bir ekranda: qurilmalar/binolar soni, faol ogohlantirishlar, so'nggi 24 soatlik kommunal grafiklar va eng so'nggi ko'rilgan qurilmalar ro'yxati.",
    actions: [
      "Utility kartasini bosib, o'sha turdagi qurilmalar ro'yxatiga o'tish",
      "So'nggi qurilma qatorini bosib, uning tafsilot sahifasini ochish",
      'Faol ogohlantirishlar oqimini kuzatish',
    ],
  },
  {
    label: 'Binolar',
    path: '/buildings',
    icon: Building2,
    summary:
      "Barcha binolar ro'yxati — qidiruv, karta/jadval ko'rinishi va interaktiv xarita (holatiga qarab rangli belgilar bilan).",
    actions: [
      "Yangi bino qo'shish (nom, manzil, qavat/podyezd soni)",
      "Tashqi tizimdan binolarni ommaviy import qilish",
      "Bino kartasini bosib, uning to'liq sahifasiga o'tish",
    ],
  },
  {
    label: 'Qurilmalar',
    path: '/devices',
    icon: Cpu,
    summary:
      "Barcha ESP32 qurilmalarining asosiy ro'yxati — qidiruv, utility/holat bo'yicha filtr, CSV eksport. \"Yangi\" (binoga bog'lanmagan) va \"test\" qurilmalari alohida belgilanadi.",
    actions: [
      "Yangi qurilma qo'shish",
      "Bog'lanmagan qurilmani biror binoga tezkor biriktirish",
      'Qurilma qatorini bosib tafsilotini ochish',
    ],
  },
  {
    label: 'Test qurilmalar',
    path: '/devices/test',
    icon: FlaskConical,
    summary:
      "Faqat admin. Ishlab chiqish/sinov uchun belgilangan qurilmalar — hech qachon real binoga bog'lanmaydi va faolsizlikdan ~5 daqiqadan keyin avtomatik o'chadi. Soxta o'lchov yuborish paneli ham shu yerda.",
    actions: [
      "Qo'lda soxta o'lchov (kWh) yuborish",
      "Ishlab chiqarish-himoya (\"Guard\") tekshiruvini ishga tushirish",
    ],
  },
  {
    label: 'Analitika',
    path: '/analytics',
    icon: Activity,
    summary:
      "Bino/utility bo'yicha kesishgan hisobot — soat/kun/oy granulyatsiyasi, sarf va o'rtacha ko'rsatkich grafiklar, batafsil jadval.",
    actions: ['CSV yoki Excel (ko\'p varaqli) eksport', 'Chop etish / PDF ko\'rinishi'],
  },
  {
    label: 'Ogohlantirishlar',
    path: '/alerts',
    icon: Bell,
    summary:
      "\"Jurnal\" (kelib chiqqan ogohlantirishlar tarixi) va \"Qoidalar\" (chegara qiymatlari — masalan yuqori kuchlanish, past suv bosimi) ikkita bo'limi.",
    actions: [
      "Ogohlantirishni tozalash yoki barchasini tozalash",
      "Yangi qoida yaratish (utility, min/max chegara, jiddiylik, bino ko'lami)",
      "Qoidani yoqish/o'chirish",
    ],
  },
  {
    label: 'Kommunal hisobotlar',
    path: '/billing',
    icon: FileSpreadsheet,
    summary:
      "Bino kesimida sarf/hisoblangan/to'langan/qarzdorlik, top iste'molchilar reytingi va Excel hisobot yuklash tarixi.",
    actions: [
      'Utility bo\'yicha Excel hisobot yuklash (bo\'sh shablonni yuklab olish mumkin)',
      "Davr/utility bo'yicha filtrlash",
    ],
  },
  {
    label: 'Xonadonlar',
    path: '/territory',
    icon: Home,
    summary:
      "Turar-joy ierarxiyasi: Mahallalar → Ko'chalar → Xonadonlar. Hisobotlar va billing shu ro'yxatga tayanadi.",
    actions: ["Xonadon/ko'cha/mahalla qo'shish", "Excel orqali ommaviy xonadon import qilish"],
  },
  {
    label: 'AI yordamchi',
    path: '/chat',
    icon: MessageSquare,
    summary:
      "Tizim holati haqida erkin savol berish mumkin (\"nechta qurilma oflayn\", \"12/2-uy sarfi qancha\" kabi) — AI real ma'lumotlarga asoslanib javob beradi.",
    actions: ['Model tanlash (Gemini / DeepSeek)', "Tayyor savol chiplaridan foydalanish"],
  },
  {
    label: 'Firmware / OTA',
    path: '/firmware',
    icon: HardDriveDownload,
    summary:
      "Yuklangan firmware versiyalari katalogi va OTA (havo orqali yangilash) partiyalari — qaysi qurilmalarga qachon yuborilishini boshqarish.",
    actions: [
      "Yangi firmware (.bin) yuklash",
      "OTA partiya yaratish (soatiga nechta qurilma, jadval)",
      "Bitta qurilmaga qo'lda yangilanish yuborish",
    ],
  },
  {
    label: 'Foydalanuvchilar',
    path: '/users',
    icon: Users,
    summary:
      "Faqat admin. Tizim foydalanuvchilarini boshqarish — rol: admin, foydalanuvchi, ko'rgazma, yoki suv/gaz/elektr tashkiloti operatori.",
    actions: [
      "Yangi foydalanuvchi yaratish",
      "Rol/parol o'zgartirish",
      'Faolsizlantirish / qayta faollashtirish',
    ],
  },
  {
    label: 'Audit jurnali',
    path: '/audit',
    icon: ScrollText,
    summary: "Faqat admin. Tizimda kim, qachon, nima qilgani — o'zgarmas, faqat o'qish uchun jurnal.",
    actions: ['Amal/foydalanuvchi/sana bo\'yicha filtrlash', 'CSV eksport'],
  },
  {
    label: 'Sozlamalar',
    path: '/settings',
    icon: Settings,
    summary:
      "Faqat admin. Zaxira nusxalar (yaratish/tiklash), ESP32 provisioning tokenlari va tizim salomatligi paneli.",
    actions: [
      "Zaxira nusxa yaratish/yuklab olish/tiklash",
      "Yangi qurilma ro'yxatdan o'tishi uchun bir martalik token yaratish",
    ],
  },
  {
    label: 'Displey ekran',
    path: '/display',
    icon: Gauge,
    summary:
      "Autentifikatsiyasiz, katta ekran/TV uchun kiosk ko'rinishi — har 30 soniyada avtomatik yangilanadi. Bir binoga ?building_id= orqali bog'lash mumkin.",
    actions: ["To'liq ekran rejimi", "Binolar orasida avtomatik aylanish (15s)"],
  },
  {
    label: 'Demo stend',
    path: '/demo',
    icon: Presentation,
    summary:
      "Autentifikatsiyasiz, to'liq soxta ma'lumotli namoyish ekrani — savdo/taqdimot uchun, real qurilmalarga bog'liq emas.",
    actions: [],
  },
]

// ─────────────────────────────────────────────────────────────────────────
// 2-BO'LIM: IoT — GPIO/environment ma'lumotlari
// ─────────────────────────────────────────────────────────────────────────

const WIRE = 'var(--color-chart-2)'
const WIRE_OPT = 'var(--color-chart-4)'
const BOX = 'var(--color-primary)'
const DIM = 'var(--color-muted-foreground)'
const FG = 'var(--color-foreground)'

function Esp32Diagram({
  height,
  rows,
}: {
  height: number
  rows: { pin: string; label: string; optional?: boolean }[]
}) {
  const boxH = Math.min(height - 20, Math.max(60, rows.length * 34 + 20))
  const boxY = (height - boxH) / 2
  return (
    <svg viewBox={`0 0 300 ${height}`} className="h-auto w-full max-w-sm" role="img" aria-label="Ulanish sxemasi">
      <rect x="10" y={boxY} width="82" height={boxH} rx="3" fill="none" stroke={BOX} strokeWidth="1.4" />
      <text x="51" y={height / 2} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={FG}>
        ESP32
      </text>
      {rows.map((r, i) => {
        const y = boxY + 20 + i * ((boxH - 30) / Math.max(rows.length - 1, 1))
        const color = r.optional ? WIRE_OPT : WIRE
        return (
          <g key={r.pin} fontFamily="ui-monospace,monospace">
            <line
              x1="92"
              y1={y}
              x2="170"
              y2={y}
              stroke={color}
              strokeWidth="1.3"
              strokeDasharray={r.optional ? '3 2' : undefined}
            />
            <text x="97" y={y - 5} fontSize="9" fill={DIM}>
              {r.pin}
            </text>
            <rect
              x="170"
              y={y - 14}
              width="120"
              height="28"
              rx="3"
              fill="none"
              stroke={color}
              strokeWidth="1.3"
              strokeDasharray={r.optional ? '3 2' : undefined}
            />
            <text x="230" y={y + 4} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={FG}>
              {r.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

interface SensorSpec {
  id: string
  title: string
  tag?: string
  intro: string
  diagram: { pin: string; label: string; optional?: boolean }[]
  pins: { signal: string; pin: string }[]
  envs: { name: string; note: string; badge?: 'wifi' | 'leaf' | 'test' }[]
  note?: string
}

const SENSORS: SensorSpec[] = [
  {
    id: 'elektr',
    title: 'Elektr hisoblagich',
    tag: 'TE71 / TE73',
    intro:
      "DLMS/COSEM protokoli, HDLC ustida (HLS5 GMAC autentifikatsiya, 4800 baud fallback). Faqat TE71/TE73 qo'llab-quvvatlanadi.",
    diagram: [
      { pin: 'GPIO16 (RX)', label: 'DLMS RX' },
      { pin: 'GPIO17 (TX)', label: 'DLMS TX' },
      { pin: 'GPIO4 (DE)', label: 'DLMS DE' },
      { pin: 'GPIO21/22', label: 'LCD (ixtiyoriy)', optional: true },
    ],
    pins: [
      { signal: 'DLMS RX', pin: 'GPIO16' },
      { signal: 'DLMS TX', pin: 'GPIO17' },
      { signal: 'DLMS DE', pin: 'GPIO4' },
      { signal: 'LCD SDA / SCL (ixtiyoriy)', pin: 'GPIO21 / GPIO22' },
    ],
    envs: [
      { name: 'electricity', note: 'Production, LCD yoqilgan', badge: 'wifi' },
      { name: 'electricity_debug', note: 'Serial log yoqilgan', badge: 'wifi' },
      { name: 'electricity_test', note: 'Simulyatsiya — metr kerak emas', badge: 'test' },
      { name: 'electricity_rs485_leaf', note: 'RS-485 leaf rejimi', badge: 'leaf' },
    ],
    note: "Avtomatik CRC/FCS tekshiruvi haqiqiy TE71/TE73'da hali sinalmagan — ataylab qo'shilmagan, ishonchli ishlaydigan variant saqlangan.",
  },
  {
    id: 'suv',
    title: 'Suv bosimi',
    intro: 'ADS1115 orqali 4-20mA bosim datchigi (pastki, ixtiyoriy yuqori) + impuls oqim hisoblagichi.',
    diagram: [
      { pin: 'SDA/SCL', label: 'ADS1115 (0x48)' },
      { pin: 'GPIO25/26', label: 'Oqim impulsi' },
    ],
    pins: [
      { signal: 'ADS1115 SDA / SCL', pin: 'GPIO21 / GPIO22' },
      { signal: 'ADS1115 manzil', pin: '0x48' },
      { signal: 'Oqim impulsi (standalone)', pin: 'GPIO25' },
      { signal: 'Oqim impulsi (RS-485 leaf)', pin: 'GPIO26 (25 shina DE bilan band)' },
    ],
    envs: [
      { name: 'water', note: "Standalone WiFi, LCD yo'q", badge: 'wifi' },
      { name: 'water_debug', note: 'Serial log', badge: 'wifi' },
      { name: 'water_rs485_leaf', note: 'RS-485 leaf', badge: 'leaf' },
      { name: 'water_display', note: 'Faqat LCD — shinani tinglaydi', badge: 'leaf' },
    ],
  },
  {
    id: 'gaz',
    title: 'Gaz bosimi',
    intro: "Suvnikiga o'xshash — ADS1115 + 4-20mA transmitter (oddiy pressure switch YETARLI EMAS) + impuls oqim.",
    diagram: [
      { pin: 'SDA/SCL', label: 'ADS1115 (0x48)' },
      { pin: 'GPIO26', label: 'Oqim impulsi' },
    ],
    pins: [
      { signal: 'ADS1115 SDA / SCL', pin: 'GPIO21 / GPIO22' },
      { signal: 'Oqim impulsi', pin: 'GPIO26' },
      { signal: 'Kalibrovka', pin: 'GAS_M3_PER_PULSE=0.01' },
    ],
    envs: [
      { name: 'gas', note: 'Standalone WiFi', badge: 'wifi' },
      { name: 'gas_rs485_leaf', note: 'RS-485 leaf', badge: 'leaf' },
      {
        name: 'gas_test',
        note: 'Simulyatsiya — ADS1115 chipi ham shart emas, LCD\'da "Gaz: X bar" ko\'rsatadi',
        badge: 'test',
      },
    ],
  },
  {
    id: 'tuproq',
    title: 'Tuproq namligi',
    tag: 'havo sifati ixtiyoriy',
    intro: 'Kapasitiv namlik datchigi, ADC orqali. MQ135 qo\'shilsa bitta taxta ikkalasini ham yuboradi.',
    diagram: [
      { pin: 'GPIO34', label: 'Namlik ADC' },
      { pin: 'GPIO35', label: 'MQ135', optional: true },
    ],
    pins: [
      { signal: 'Namlik ADC', pin: 'GPIO34' },
      { signal: 'MQ135 (ixtiyoriy, -DHAVE_MQ135)', pin: 'GPIO35' },
      { signal: 'Kalibrovka', pin: 'SOIL_ADC_DRY / SOIL_ADC_WET' },
    ],
    envs: [
      { name: 'soil_wifi_lcd', note: 'Standalone, LCD bilan', badge: 'wifi' },
      { name: 'soil_wifi', note: "Standalone, LCD'siz", badge: 'wifi' },
      { name: 'soil_rs485_leaf', note: 'RS-485 leaf, faqat namlik', badge: 'leaf' },
      { name: 'soil_mq135_rs485_leaf', note: 'RS-485 leaf + MQ135', badge: 'leaf' },
      { name: 'soil_mq135_test', note: 'Stol ustida sinov', badge: 'test' },
    ],
    note: "Havo sifati saytda xom (invertsiz) qiymat sifatida ko'rsatiladi — yuqori = ifloslangan.",
  },
  {
    id: 'ovoz',
    title: 'Ovoz darajasi',
    tag: 'havo sifati ixtiyoriy',
    intro:
      "Mikrofon ADC (glitch-proof peak-to-peak o'lchov). MQ135 qo'shilsa — yo'lak ovozi + yo'lak havo sifatini birga yuboradi.",
    diagram: [
      { pin: 'GPIO34', label: 'Mikrofon' },
      { pin: 'GPIO35', label: 'MQ135', optional: true },
    ],
    pins: [
      { signal: 'Mikrofon ADC', pin: 'GPIO34' },
      { signal: 'MQ135 (ixtiyoriy, -DHAVE_MQ135)', pin: 'GPIO35' },
    ],
    envs: [
      { name: 'sound_wifi_lcd', note: 'Standalone, LCD bilan', badge: 'wifi' },
      { name: 'sound_wifi', note: "Standalone, LCD'siz", badge: 'wifi' },
      { name: 'sound_air_wifi_lcd', note: '+ MQ135, LCD bilan', badge: 'wifi' },
      { name: 'sound_air_wifi', note: "+ MQ135, LCD'siz", badge: 'wifi' },
      { name: 'sound_rs485_leaf', note: 'RS-485 leaf', badge: 'leaf' },
    ],
    note: 'Havo sifati backend\'da alohida utility sifatida saqlanadi (sensor_type=microphone) — tuproqdagi MQ135 bilan aralashtirilmaydi.',
  },
]

const HEATING_ENVS = [
  { name: 'heating', wiring: 'Ikki shina', note: 'Standalone WiFi', badge: 'wifi' as const },
  { name: 'heating_debug', wiring: 'Ikki shina', note: 'Serial log + LCD', badge: 'wifi' as const },
  { name: 'heating_debug_shared', wiring: 'Bitta shina', note: 'Stend tekshiruvi', badge: 'wifi' as const },
  { name: 'heating_rs485_leaf', wiring: 'Ikki shina', note: 'RS-485 leaf', badge: 'leaf' as const },
  { name: 'heating_rs485_leaf_debug', wiring: 'Ikki shina', note: 'RS-485 leaf + Serial log', badge: 'leaf' as const },
  { name: 'heating_rs485_leaf_shared', wiring: 'Bitta shina', note: 'RS-485 leaf, production', badge: 'leaf' as const },
  {
    name: 'heating_rs485_leaf_shared_debug',
    wiring: 'Bitta shina',
    note: 'RS-485 leaf + Serial log',
    badge: 'leaf' as const,
  },
  { name: 'heating_display', wiring: '—', note: 'Faqat LCD', badge: 'leaf' as const },
]

const FULL_ENV_TABLE: { name: string; mode: 'wifi' | 'leaf' | 'bridge' | 'test'; sensor: string }[] = [
  { name: 'soil_wifi_lcd / soil_wifi', mode: 'wifi', sensor: 'Tuproq namligi' },
  { name: 'sound_wifi_lcd / sound_wifi', mode: 'wifi', sensor: 'Ovoz' },
  { name: 'sound_air_wifi_lcd / sound_air_wifi', mode: 'wifi', sensor: 'Ovoz + havo sifati' },
  { name: 'electricity / electricity_debug / electricity_test', mode: 'wifi', sensor: 'Elektr (DLMS)' },
  { name: 'water / water_debug', mode: 'wifi', sensor: 'Suv bosimi' },
  { name: 'gas / gas_test', mode: 'wifi', sensor: 'Gaz bosimi' },
  { name: 'heating / heating_debug / heating_debug_shared', mode: 'wifi', sensor: 'Isitish' },
  { name: 'water_rs485_leaf', mode: 'leaf', sensor: 'Suv bosimi' },
  { name: 'gas_rs485_leaf', mode: 'leaf', sensor: 'Gaz bosimi' },
  { name: 'soil_rs485_leaf / soil_mq135_rs485_leaf', mode: 'leaf', sensor: 'Tuproq (+MQ135)' },
  { name: 'sound_rs485_leaf', mode: 'leaf', sensor: 'Ovoz' },
  { name: 'heating_rs485_leaf(_debug)', mode: 'leaf', sensor: 'Isitish, ikki shina' },
  { name: 'heating_rs485_leaf_shared(_debug)', mode: 'leaf', sensor: 'Isitish, bitta shina' },
  { name: 'electricity_rs485_leaf', mode: 'leaf', sensor: 'Elektr (DLMS→JSON)' },
  { name: 'building_bridge', mode: 'bridge', sensor: 'Elektr + barcha leaf' },
  { name: 'water_display / heating_display', mode: 'bridge', sensor: 'Faqat LCD, passiv' },
  { name: 'soil_mq135_test', mode: 'test', sensor: 'Stol ustida sinov' },
  { name: 'ads1115_test', mode: 'test', sensor: 'ADS1115 chip (I2C 0x48)' },
  { name: 'rs485_selftest', mode: 'test', sensor: 'Freym protokoli o\'z-o\'zini sinash' },
  { name: 'rs485_master_test', mode: 'test', sensor: 'Master/poll simulyatori' },
  { name: 'rs485_rxmon', mode: 'test', sensor: 'Xom bayt monitor' },
]

const MODE_LABEL: Record<string, string> = { wifi: 'WIFI', leaf: 'LEAF', bridge: 'BRIDGE', test: 'TEST' }
const MODE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  wifi: 'default',
  leaf: 'secondary',
  bridge: 'outline',
  test: 'destructive',
}

const TROUBLESHOOT = [
  { problem: 'LCD hech narsa ko\'rsatmayapti', check: 'Simlash va I2C manzilini tekshiring; boot logida "LCD... OK/FAIL" ko\'rinadi' },
  { problem: 'Qurilma backend\'da ko\'rinmayapti', check: "Serial log orqali WiFi ulanganini va server manzilini tekshiring" },
  { problem: 'Elektr hisoblagich o\'qilmayapti', check: "RS-485 A/B ulanishini, hisoblagichda DLMS/HDLC yoqilganini tekshiring" },
  { problem: 'Sensor doim "0" yoki bir xil qiymat', check: "Avtomatik \"xato\" (uzilgan/nosoz) deb belgilanadi — jismoniy ulanishni tekshiring" },
  {
    problem: 'Isitishda faqat kirish/chiqish topildi, ikkinchisi yo\'q',
    check: 'Ikkala datchik bir simga ulangan bo\'lishi mumkin — _shared environment ishlating',
  },
  {
    problem: 'RS-485 leaf hech narsa yubormayapti',
    check: "Leaf faqat bridge so'raganda javob beradi — Serial log jim bo'lishi normal, bridge bilan birga sinang",
  },
]

// ─────────────────────────────────────────────────────────────────────────

function SensorCard({ s }: { s: SensorSpec }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-start justify-between gap-3 p-4 text-left sm:p-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{s.title}</h3>
                {s.tag && (
                  <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {s.tag}
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{s.intro}</p>
            </div>
            <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="grid gap-6 pt-0 md:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
            <div className="rounded-md border bg-muted/30 p-3">
              <Esp32Diagram height={s.diagram.length * 40 + 20} rows={s.diagram} />
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  GPIO jadvali
                </h4>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Signal</TableHead>
                        <TableHead>Pin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.pins.map((p) => (
                        <TableRow key={p.signal}>
                          <TableCell className="text-sm">{p.signal}</TableCell>
                          <TableCell className="font-mono text-sm text-emerald-600 dark:text-emerald-400">
                            {p.pin}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div>
                <h4 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Environment
                </h4>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Izoh</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.envs.map((e) => (
                        <TableRow key={e.name}>
                          <TableCell className="whitespace-nowrap font-mono text-sm">
                            <div className="flex items-center gap-2">
                              {e.name}
                              {e.badge && (
                                <Badge variant={MODE_VARIANT[e.badge]} className="font-mono text-[9px]">
                                  {MODE_LABEL[e.badge]}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.note}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {s.note && (
                <p className="rounded-md border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
                  {s.note}
                </p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hujjatlar</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Dasturdan qanday foydalanish va ESP32 qurilmalarini qanday ulash — hammasi bitta joyda.
        </p>
      </div>

      <Tabs defaultValue="app">
        <TabsList>
          <TabsTrigger value="app">Dasturdan foydalanish</TabsTrigger>
          <TabsTrigger value="iot">IoT qurilmalar</TabsTrigger>
        </TabsList>

        {/* ═══════════════════ DASTURDAN FOYDALANISH ═══════════════════ */}
        <TabsContent value="app" className="space-y-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {APP_SECTIONS.map((s) => {
              const Icon = s.icon
              return (
                <Card key={s.path} className="flex flex-col">
                  <CardHeader className="flex-row items-start gap-3 space-y-0">
                    <div className="rounded-md border bg-muted/40 p-2">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-[15px]">
                        <Link to={s.path} className="hover:underline">
                          {s.label}
                        </Link>
                      </CardTitle>
                      <CardDescription className="mt-1 text-[13px] leading-relaxed">{s.summary}</CardDescription>
                    </div>
                  </CardHeader>
                  {s.actions.length > 0 && (
                    <CardContent className="mt-auto pt-0">
                      <ul className="space-y-1">
                        {s.actions.map((a) => (
                          <li key={a} className="flex gap-2 text-[12.5px] text-muted-foreground">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Rollar</CardTitle>
              <CardDescription>Har bir foydalanuvchi rolga qarab turlicha ko'radi.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                ['Admin', "To'liq huquq — Test qurilmalar, Foydalanuvchilar, Audit, Sozlamalar shu rolga ochiq."],
                ['Foydalanuvchi / ko\'rgazma', "O'qish huquqi — ko'pchilik tahrirlash tugmalari yashirin."],
                ['Suv / gaz / elektr tashkiloti', "Faqat o'z utility'siga oid Kommunal hisobotlar sahifasini ko'radi va yuklaydi."],
              ].map(([t, d]) => (
                <div key={t} className="rounded-md border p-3">
                  <div className="text-sm font-semibold">{t}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{d}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════ IOT ═══════════════════════════ */}
        <TabsContent value="iot" className="space-y-8 pt-2">
          <section>
            <h2 className="mb-1 text-lg font-semibold">Ikki ulanish rejimi</h2>
            <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
              LoRa yo'q — har bir bino WiFi/internetga ega. Qurilma yoki to'g'ridan-to'g'ri WiFi'ga, yoki bino
              ichidagi RS-485 shinasi orqali bitta "bridge"ga ulanadi.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">A — Standalone WiFi</CardTitle>
                  <CardDescription>Bitta ESP32 = bitta sensor, to'g'ridan-to'g'ri router'ga ulanadi.</CardDescription>
                </CardHeader>
                <CardContent>
                  <svg viewBox="0 0 340 100" className="h-auto w-full" role="img" aria-label="Sensor to'g'ridan-to'g'ri WiFi orqali backend'ga">
                    <g fontFamily="ui-monospace,monospace" fontSize="10">
                      <rect x="6" y="30" width="84" height="40" rx="3" fill="none" stroke={BOX} strokeWidth="1.4" />
                      <text x="48" y="54" textAnchor="middle" fill={FG} fontWeight="700">SENSOR</text>
                      <path d="M90 50 H150" stroke={WIRE} strokeWidth="1.4" />
                      <text x="120" y="44" textAnchor="middle" fill={WIRE} fontSize="9">WiFi</text>
                      <rect x="150" y="30" width="84" height="40" rx="3" fill="none" stroke={DIM} strokeWidth="1.3" strokeDasharray="2 2" />
                      <text x="192" y="54" textAnchor="middle" fill={FG} fontWeight="700">ROUTER</text>
                      <path d="M234 50 H294" stroke={WIRE} strokeWidth="1.4" />
                      <text x="264" y="44" textAnchor="middle" fill={WIRE} fontSize="9">HTTPS</text>
                      <rect x="294" y="24" width="40" height="52" rx="3" fill="none" stroke={BOX} strokeWidth="1.4" />
                      <text x="314" y="53" textAnchor="middle" fill={FG} fontWeight="700" fontSize="9">API</text>
                    </g>
                  </svg>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">B — RS-485 bino-ichi shinasi</CardTitle>
                  <CardDescription>Bir nechta leaf → bitta bridge → WiFi orqali backend.</CardDescription>
                </CardHeader>
                <CardContent>
                  <svg viewBox="0 0 340 120" className="h-auto w-full" role="img" aria-label="Leaf sensorlar RS-485 orqali bridge'ga">
                    <g fontFamily="ui-monospace,monospace" fontSize="9.5">
                      <rect x="4" y="6" width="52" height="26" rx="3" fill="none" stroke={WIRE} strokeWidth="1.3" />
                      <text x="30" y="23" textAnchor="middle" fill={FG} fontWeight="700" fontSize="8.5">LEAF</text>
                      <rect x="4" y="42" width="52" height="26" rx="3" fill="none" stroke={WIRE} strokeWidth="1.3" />
                      <text x="30" y="59" textAnchor="middle" fill={FG} fontWeight="700" fontSize="8.5">LEAF</text>
                      <rect x="4" y="78" width="52" height="26" rx="3" fill="none" stroke={WIRE} strokeWidth="1.3" />
                      <text x="30" y="95" textAnchor="middle" fill={FG} fontWeight="700" fontSize="8.5">LEAF</text>
                      <line x1="66" y1="19" x2="66" y2="91" stroke={DIM} strokeWidth="1.3" />
                      <line x1="56" y1="19" x2="66" y2="19" stroke={DIM} strokeWidth="1.3" />
                      <line x1="56" y1="55" x2="66" y2="55" stroke={DIM} strokeWidth="1.3" />
                      <line x1="56" y1="91" x2="66" y2="91" stroke={DIM} strokeWidth="1.3" />
                      <path d="M66 55 H140" stroke={DIM} strokeWidth="1.3" />
                      <rect x="140" y="38" width="66" height="36" rx="3" fill="none" stroke={BOX} strokeWidth="1.5" />
                      <text x="173" y="59" textAnchor="middle" fill={FG} fontWeight="700" fontSize="9">BRIDGE</text>
                      <path d="M206 55 H262" stroke={WIRE} strokeWidth="1.4" />
                      <text x="234" y="48" textAnchor="middle" fill={WIRE} fontSize="8.5">WiFi</text>
                      <rect x="262" y="32" width="40" height="48" rx="3" fill="none" stroke={BOX} strokeWidth="1.4" />
                      <text x="282" y="59" textAnchor="middle" fill={FG} fontWeight="700" fontSize="9">API</text>
                    </g>
                  </svg>
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">RS-485 shina simlash</h2>
            <p className="mb-3 max-w-2xl text-sm text-muted-foreground">
              Barcha leaf turlari uchun bitta umumiy shina. Elektr hisoblagichning DLMS ulanishi — alohida, ikkinchi
              shina.
            </p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shina</TableHead>
                    <TableHead>Signal</TableHead>
                    <TableHead>Pin</TableHead>
                    <TableHead>Izoh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell rowSpan={3} className="align-top text-sm font-medium">Leaf bus (umumiy)</TableCell>
                    <TableCell className="text-sm">RO (RX)</TableCell>
                    <TableCell className="font-mono text-sm text-emerald-600 dark:text-emerald-400">GPIO32</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Har bir leaf + bridge bir xil ulaydi</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm">DI (TX)</TableCell>
                    <TableCell className="font-mono text-sm text-emerald-600 dark:text-emerald-400">GPIO33</TableCell>
                    <TableCell className="text-sm text-muted-foreground">19200 baud</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm">DE+RE</TableCell>
                    <TableCell className="font-mono text-sm text-emerald-600 dark:text-emerald-400">GPIO25</TableCell>
                    <TableCell className="text-sm text-muted-foreground">MAX485 DE/RE bitta pinga ulanadi</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell rowSpan={3} className="align-top text-sm font-medium">DLMS (faqat elektr)</TableCell>
                    <TableCell className="text-sm">RX</TableCell>
                    <TableCell className="font-mono text-sm text-emerald-600 dark:text-emerald-400">GPIO16</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Metrga — leaf bus bilan chalkashtirmang</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm">TX</TableCell>
                    <TableCell className="font-mono text-sm text-emerald-600 dark:text-emerald-400">GPIO17</TableCell>
                    <TableCell className="text-sm text-muted-foreground">—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm">DE</TableCell>
                    <TableCell className="font-mono text-sm text-emerald-600 dark:text-emerald-400">GPIO4</TableCell>
                    <TableCell className="text-sm text-muted-foreground">2-chi MAX485 kerak</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 rounded-md border-l-2 border-destructive bg-destructive/10 px-3 py-2 text-xs text-muted-foreground">
              <b className="text-destructive">Diqqat:</b> A/B simlarini almashtirib ulasangiz shina jim qoladi. Shina
              uzun bo'lsa (&gt;20m) ikki uchiga 120Ω terminatsiya qo'ying.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Sensorlar</h2>
            <div className="space-y-3">
              {SENSORS.map((s) => (
                <SensorCard key={s.id} s={s} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">Isitish — ikki simlash usuli</h2>
            <p className="mb-3 max-w-2xl text-sm text-muted-foreground">
              2× DS18B20 (kirish/chiqish harorat, ΔT hisoblanadi) — yo har biri alohida GPIO'da, yo ikkalasi bitta
              simga T-ulangan.
            </p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Environment</TableHead>
                    <TableHead>Simlash</TableHead>
                    <TableHead>Izoh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {HEATING_ENVS.map((e) => (
                    <TableRow key={e.name}>
                      <TableCell className="whitespace-nowrap font-mono text-sm">
                        <div className="flex items-center gap-2">
                          {e.name}
                          <Badge variant={MODE_VARIANT[e.badge]} className="font-mono text-[9px]">
                            {MODE_LABEL[e.badge]}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{e.wiring}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Bitta-shina rejimida kirish/chiqish OneWire qidiruv <b>tartibi</b> bo'yicha ajratiladi (0-indeks =
              kirish). Agar sinovda teskari chiqsa — <code className="rounded bg-muted px-1 py-0.5 font-mono">-DSWAP_IN_OUT=true</code>{' '}
              qo'shing, qayta lehimlash shart emas. Pinlar: kirish <code className="rounded bg-muted px-1 py-0.5 font-mono">GPIO4</code>,
              chiqish (ikki-shina rejimida) <code className="rounded bg-muted px-1 py-0.5 font-mono">GPIO5</code>.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">Bridge va faqat-displey taxtalar</h2>
            <p className="mb-3 max-w-2xl text-sm text-muted-foreground">
              <code className="rounded bg-muted px-1 py-0.5 font-mono">building_bridge</code> — har binoda bitta,
              o'z elektr hisoblagichini o'qiydi va RS-485 leaf shinasini so'rab, hammasini WiFi orqali yuboradi.
              Faqat-displey taxtalar esa WiFi/sensorsiz — shinani passiv tinglab LCD'da ko'rsatadi.
            </p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Environment</TableHead>
                    <TableHead>Ko'rsatadi</TableHead>
                    <TableHead>LCD format</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-mono text-sm">water_display</TableCell>
                    <TableCell className="text-sm">Suv bosimi</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">Suv: 2.42 bar</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-sm">heating_display</TableCell>
                    <TableCell className="text-sm">Kirish/chiqish harorat</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">K:34.6 Ch:33.1</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Flash qilish</h2>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
{`cd iot_v2
pio run -e <environment_nomi> -t upload --upload-port /dev/cu.usbserial-XXXX

# Port nomini bilmasangiz:
pio device list

# Serial log (loglarni ko'rish):
pio device monitor -p /dev/cu.usbserial-XXXX -b 115200`}
            </pre>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">WiFi sozlash</h2>
            <ol className="space-y-3 border-l pl-5">
              {[
                <>Qurilma yoqilganda ulanolmasa, <b>darhol</b> o'z sozlash tarmog'ini (AP) ochadi — standart nom <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Bakhromdev</code>.</>,
                <>Telefon/kompyuterda shu tarmoqqa ulaning (parol standart <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">998935580311</code>).</>,
                <>Ochilgan sahifada ("captive portal") o'z WiFi tarmog'ingizni tanlang, parolni kiriting.</>,
                <>Server/token maydonlarini odatda standart qiymat bilan qoldiring.</>,
                <>"Saqlash"ni bosing — qurilma qayta ulanadi.</>,
                <>10 daqiqa ichida sozlanmasa yoki keyinchalik tarmoq topilmay qolsa: bitta ulanish urinishi → hali bo'lmasa portal <b>yana</b> ochiladi — bu sikl WiFi tuzalguncha davom etadi.</>,
              ].map((text, i) => (
                <li key={i} className="relative pl-2 text-sm">
                  <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full border border-primary font-mono text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  {text}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              WiFi'ni qayta sozlash kerak bo'lsa (masalan boshqa binoga ko'chirilsa):{' '}
              <b className="text-foreground">BOOT tugmasini ~3 soniya</b> bosib turing.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Barcha environment'lar</h2>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Environment</TableHead>
                    <TableHead>Rejim</TableHead>
                    <TableHead>Sensor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FULL_ENV_TABLE.map((e) => (
                    <TableRow key={e.name}>
                      <TableCell className="whitespace-nowrap font-mono text-sm">{e.name}</TableCell>
                      <TableCell>
                        <Badge variant={MODE_VARIANT[e.mode]} className="font-mono text-[9px]">
                          {MODE_LABEL[e.mode]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.sensor}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Nosozliklarni tuzatish</h2>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Muammo</TableHead>
                    <TableHead>Tekshirish</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TROUBLESHOOT.map((t) => (
                    <TableRow key={t.problem}>
                      <TableCell className="text-sm">{t.problem}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.check}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
