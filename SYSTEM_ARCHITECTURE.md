# Tizim arxitekturasi — to'liq ko'rinish

Bu hujjat butun loyihaning joriy holatini tasvirlaydi: backend, ikkita frontend, IoT firmware (barcha rejimlari), desktop dastur va infratuzilma. Maqsad — arxitekturani bir joyda ko'rib chiqib, muammoli/nomutanosib joylarni aniqlash.

---

## 1. Umumiy ko'rinish

```
┌──────────────┐   HTTP (WiFi)              ┌──────────────────┐
│ ESP32 sensor │ ─────────────────────────► │                   │
│ (soil/water/ │   X-Device-Token           │                   │
│ gas/sound/   │                             │                   │
│ electricity) │                             │   FastAPI backend │
└──────────────┘                             │   (Python 3.12,   │
                                               │   SQLAlchemy      │
┌──────────────┐   LoRa 433MHz (mesh v2)     │   async, Postgres) │
│ ESP32 sensor │ ──► ┌──────────────┐  HTTP  │                   │
│ (LoRa node)  │      │ ESP32        │──────►│                   │
└──────────────┘      │ LoRa gateway │        └─────────┬─────────┘
                       └──────────────┘                  │
                                                          │ SQLAlchemy async
                                                          ▼
                                                   ┌──────────────┐
                                                   │  PostgreSQL   │
                                                   └──────────────┘
                                                          ▲
                                                          │ REST + WebSocket
                       ┌──────────────────────────────────┴───────────────────┐
                       ▼                                                      ▼
              ┌─────────────────┐                                  ┌─────────────────┐
              │ meter-frontend  │  ss.boos.uz (v1, legacy)          │ meter-frontend-v2│  sss.boos.uz (v2, shadcn)
              │ React + Vite    │                                   │ React + Vite      │
              └─────────────────┘                                  └─────────────────┘

┌──────────────────┐
│ PyQt6 desktop app │  RS-485/DLMS orqali hisoblagichni to'g'ridan-to'g'ri test qilish,
│ (meter testing)   │  ESP32 firmware flash qilish uchun
└──────────────────┘
```

Bitta backend, bitta Postgres baza — ikkala frontend ham xuddi shu API'ga ulanadi. IoT tomonda ikki mustaqil aloqa yo'li bor: **WiFi/HTTP** (to'g'ridan-to'g'ri) va **LoRa mesh** (node → gateway → HTTP).

---

## 2. Backend

**Stack**: FastAPI + SQLAlchemy 2.0 (async) + PostgreSQL + Alembic migratsiyalari + asyncpg driver. SQLite butunlay olib tashlangan (2026-07-30 sanasidagi tozalashda) — endi faqat Postgres qo'llab-quvvatlanadi, `DATABASE_URL` validatsiyada majburiy tekshiriladi.

### 2.1 Qatlamlar

```
routers/    → HTTP endpoint'lar, so'rov validatsiyasi, auth dependency
services/   → biznes mantiq (bir domain — bitta service fayli)
repositories/ → DB so'rovlarini abstraktsiya qiluvchi qatlam
models/     → SQLAlchemy entity'lar (entities.py) + Pydantic schema'lar (schemas.py)
core/       → config, database engine, security (JWT), middleware, logging
migrations/ → Alembic versiyalari (hozircha 24 ta migratsiya)
```

### 2.2 Routerlar (`backend/routers/`)

| Router | Vazifa |
|---|---|
| `auth.py` | Login, JWT token, foydalanuvchi CRUD |
| `devices.py` | Qurilma register/status/list/update, device token lifecycle |
| `telemetry.py` | ESP32'dan reading qabul qilish (`/api/readings`) |
| `buildings.py` | Building, BuildingUtility, Premise, MeasurementPoint CRUD |
| `billing.py` | Kommunal hisobot Excel import/export (F3, registry, readings, simple formatlar) |
| `territory.py` | Mahalla/ko'cha/xonadon CRUD + Excel import |
| `alerts.py` | Alert qoidalari, ro'yxat, tozalash |
| `commands.py` | ESP32 uchun buyruq navbati (reboot, set_volume, set_interval, ota_check va h.k.) |
| `ota.py` | Firmware yuklash, OTA batch rollout |
| `backups.py` | DB backup export/import |
| `audit.py` | Audit jurnali |
| `chat.py` | AI yordamchi (Gemini/DeepSeek), tool-calling orqali xavfsiz DB so'rovlari |
| `websocket.py` | Dashboard uchun real-time holat |
| `display.py` | Jamoat displey (foyer/kirish ekrani) uchun soddalashtirilgan endpoint |
| `health.py` | `/health` — deploy/monitoring uchun |

### 2.3 Ma'lumotlar bazasi — asosiy modellar

**Qurilma va o'lchov:**
- `Device` — har bir ESP32 (id=MAC yoki custom), `utility_type`, token, firmware holati
- `Reading` — xom o'lchovlar (elektr/suv/gaz/tuproq/ovoz — bitta jadval, `utility_type` bilan farqlanadi)
- `HourlyUtilityStats` — soatlik agregatsiya (dashboard grafiklarini tezlashtirish uchun)
- `MeasurementPoint`, `Premise`, `BuildingUtility` — bino ichidagi tarmoq topologiyasi (asosiy hisoblagich, xonadon nuqtalari)

**Bino/hudud (billing tizimi, 2026-07 oxirida qo'shilgan):**
- `Mahalla` → `Street` → `Building` (`street_id`+`house_no`) → `Apartment`
- `UtilityBilling` — oylik hisob-kitob (har xonadon/bino, utility_type, period, hajm/summasi/qarzi)
- `BillingImport` — Excel import tarixi (audit uchun)

**Alert/OTA/Xavfsizlik:**
- `Alert`, `AlertRule`, `AlertNotification`
- `Command` — buyruq navbati (umumiy, barcha action turlari uchun)
- `Firmware`, `FirmwareCompatibility`, `FirmwareInstallEvent`, `OTABatch`, `OTABatchDevice`
- `User`, `DeviceProvisioningToken`, `AuditLog`, `WorkerLock`

**⚠️ Ma'lum cheklov**: barcha `ts`/vaqt ustunlari `Integer` (32-bit) tipida — bu **2038-yil muammosi** (Y2038, Unix timestamp int32 to'lib qolishi) ga moyil. Postgres'ga o'tishda (avval SQLite cheksiz kattalikda saqlagani uchun bu yashiringan edi) test paytida topildi. Hozircha tuzatilmagan — kelgusida `BigInteger`ga migratsiya kerak bo'lishi mumkin.

### 2.4 Xavfsizlik modeli

- **Foydalanuvchi auth**: JWT (access token), rol asosida `admin`/`user`/`viewer` — `require_admin` dependency orqali cheklanadi
- **Qurilma auth**: `X-Device-Token` header, har bir device'ga individual token (`device_api_token` global fallback + per-device token)
- **AI chat xavfsizligi**: `SENSITIVE_PROMPT_MARKERS` bilan SQL/schema so'rovlarini blocklaydi, tool-based dispatch (LLM to'g'ridan-to'g'ri DB'ga kira olmaydi)
- **Audit**: barcha admin amallari (`device.reboot`, `chat.admin_tool`, `chat.blocked` va h.k.) `AuditLog`ga yoziladi

**Olib tashlangan narsalar (2026-07-29/30 tozalashda)**: elektr hisoblagichni masofadan uzish/ulash (relay control — endpoint, buyruq turi, AI tool, frontend tugmalari), qurilmaning WiFi IP manzilini yuborish/saqlash, LoRa AES shifrlash (kalit repo'da ochiq bo'lgani uchun real himoya bermagan).

---

## 3. IoT Firmware (`iot/`)

**Stack**: PlatformIO + Arduino framework (ESP32). Bitta `main.cpp` — ko'plab `#ifdef` rejimlar orqali turli firmware turlarini quradi (bitta faylda ko'p mode, alohida binary'lar).

### 3.1 Umumiy fayl tuzilishi

```
include/core/     → log, config (NVS), wifi (non-blocking), http+OTA, backend API, watchdog, diag
include/sensors/  → dlms.h (DLMS/HDLC protokoli), electricity.h, water.h, gas.h, soil.h, sound.h
include/lora_*.h  → LoRa mesh v2: packet format, crypto (endi faqat CRC), mesh (dedup/relay/ACK),
                     node (sensor tomoni), gw (gateway tomoni)
include/display/  → LCD/OLED displey modullari (elektr, tuproq, ovoz, yo'q holat)
src/main.cpp      → barcha rejimlar bitta faylda, #ifdef bilan ajratilgan
```

### 3.2 Rejimlar (build environment'lar, `platformio.ini`)

| Sensor | WiFi/HTTP | LoRa node | Izoh |
|---|---|---|---|
| Elektr (TE71/TE73) | `electricity`, `electricity_debug`, `electricity_test` | `electricity_lora`, `electricity_lora_lcd`, `electricity_lora_debug`, `electricity_lora_node` | RS-485 DLMS/HDLC orqali |
| Suv | `water`, `water_debug` | `water_lora`, `water_lora_debug`, `water_lora_serial_test` | ADS1115 + HY-131 (4-20mA) |
| Gaz | `gas` | `gas_lora` | ADS1115 (4-20mA transmitter kerak, pressure switch YETARLI EMAS) |
| Tuproq namligi | `soil`, `soil_debug`, `soil_wifi`, `soil_wifi_lcd`, `soil_outdoor`, `soil_basement` | `soil_lora`, `soil_lora_lcd`, `soil_lora_debug`, `soil_lora_serial_test` | Kapasitiv ADC |
| Ovoz | `sound`, `sound_wifi`, `sound_wifi_lcd`, `sound_debug` | `sound_lora` | Mikrofon ADC |
| LoRa Gateway | — | `lora_gateway`, `lora_gateway_lcd`, `lora_gateway_elec_lcd`, `lora_gateway_debug` | Barcha node turlaridan qabul qiladi |
| Test/diagnostika | `ads1115_test`, `ex518_test` | — | `ex518_test` — yangi EX518 hisoblagichi uchun test (hozircha ishlamayapti, quyida) |

### 3.3 LoRa Mesh v2 protokoli

- **Umumiy header (12 bayt, OCHIQ)**: `[pkt_type(1)][mac(6)][flags(1)][seq(4)]`
- **Relay/flood**: har qanday node TTL>0 bo'lgan paketlarni TTL-- qilib qayta uzatadi (internet-tarmog'i kabi, istalgan yo'l orqali gateway'ga yetib boradi)
- **Dedup**: `(pkt_type, mac, seq)` kaliti orqali — bir xil paketni ikki marta qayta ishlamaslik
- **Ishonchli yetkazish**: gateway ACK yuboradi, node ACK kutadi, kelmasa retry, baribir bo'lmasa buferga saqlab keyinroq qayta yuboradi (store-and-forward)
- **CRC16**: TTL bitlari 0 deb hisoblanadi — TTL o'zgarganda CRC buzilmaydi
- **Shifrlash**: OLIB TASHLANGAN (2026-07-30) — repo'dagi ochiq kalit real himoya bermagani uchun, endi faqat CRC yaxlitlik tekshiruvi

Paket turlari: elektr (51 bayt), suv (26 bayt), gaz (24 bayt), tuproq (16 bayt), ovoz (16 bayt, tuproq bilan bir xil hajm — `pkt_type` orqali farqlanadi), ACK (15 bayt).

### 3.4 DLMS/COSEM protokoli (TE71/TE73 elektr hisoblagichlar uchun)

`sensors/dlms.h` — RS-485 orqali HDLC freymlash, FCS16, SNRM/AARQ handshake, GET/ACTION servislari, HLS5 GMAC autentifikatsiya.

**Ulanish ketma-ketligi** (`sensor_connect()`):
1. 9600 baud'da `dlms_connect_reader()` (Client 1, HLS5 autentifikatsiyalangan) — asosiy usul
2. Muvaffaqiyatsiz bo'lsa → 4800 baud'da qayta urinish
3. Baribir bo'lmasa → `dlms_connect_public()` (Client 16, autentifikatsiyasiz, cheklangan ob'ektlar) — fallback
4. Test rejimida (`g_cfg.test_mode`) haqiqiy ulanish bo'lmasa ham simulyatsiya qilingan ma'lumot beriladi

**OBIS kodlari**: kuchlanish (VL1/VL2/VL3), tok (IL1/IL2/IL3), quvvat, chastota, energiya, PF — standart DLMS OBIS convention (`1.0.C.D.E.255`).

**Olib tashlangan**: `dlms_connect_manager()` (LOW auth, parol `"00000000"`) — kod bazasida hech qayerdan chaqirilmagan o'lik funksiya edi.

### 3.5 EX518 — hal qilinmagan muammo (yangi hisoblagich, TE73 o'rniga)

TE73 o'rniga test uchun **EX518** (ishlab chiqaruvchi: "Elektron Xisoblagich" MChJ, O'zbekiston-Xitoy QK) berilgan. Ishlab chiqaruvchining rasmiy sayti RS-485 uchun **DLMS HDLC** protokolini tasdiqlaydi (TE71/TE73 bilan bir xil oila), lekin:

- Barcha diagnostika (protokol, tezlik, HDLC manzil — seriya raqamidan hisoblangan variantlar ham) sinaldi — **hech qanday javob yo'q**
- Jismoniy ulanish tasdiqlangan: hisoblagich quvvatda, A/B simlari to'g'ri ulangan (continuity test o'tdi), konverter TX signal chiqarayotgani tasdiqlangan (LED)
- RX LED hech qachon yonmaydi — hisoblagich hech qachon javob bermaydi
- **Ehtimoliy sabab**: RS-485 porti menyudan faollashtirilmagan, YOKI hisoblagichda o'rnatilgan PLC moduli RS-485'ni "band qilib" qo'ygan (ishlab chiqaruvchi spec'ida "Communication module: PLC" standart deb ko'rsatilgan)
- **Keyingi qadam**: ishlab chiqaruvchiga to'g'ridan-to'g'ri murojaat (seriya raqami: `124200532257`)
- Test kodi: `iot/src/main.cpp` da `#ifdef EX518_TEST` bloki, `ex518_test` environment — mavjud `electricity_*` rejimlarga tegmaydi, alohida

---

## 4. Frontend — ikkita mustaqil ilova

Ikkalasi ham bir xil backend API'ga ulanadi, lekin **sahifalar to'plami bir xil emas**:

| Sahifa | v1 (`meter-frontend`, ss.boos.uz) | v2 (`meter-frontend-v2`, sss.boos.uz) |
|---|---|---|
| Dashboard, Devices, Buildings, Alerts, Analytics, Audit, Chat, Firmware, Settings, Users, Login, DeviceDetail, BuildingDetail, TestDevices, Display | ✅ | ✅ |
| **DemoPage** (TV-devor displey, mock ma'lumotlar bilan) | ✅ | ❌ |
| **BillingPage** (kommunal hisobot import/eksport) | ❌ | ✅ |
| **TerritoryPage** (mahalla/ko'cha/xonadon CRUD) | ❌ | ✅ |

**⚠️ Nomutanosiblik**: Billing/Territory funksiyalari faqat v2'da bor — agar v1 foydalanuvchilari ham shu funksiyaga muhtoj bo'lsa, v1'ga qo'shish kerak bo'ladi. DemoPage esa faqat v1'da — agar v2 uchun ham kerak bo'lsa, port qilish kerak.

**Texnologiya**: ikkalasi ham React 19 + Vite + TypeScript. v1 — qo'lda yozilgan Tailwind-based UI (eski, "glass-card" uslub). v2 — shadcn/ui komponentlar asosida (yangi, tizimli dizayn tizimi).

---

## 5. Desktop dastur (`desktop/`)

PyQt6 asosida, RS-485/DLMS orqali hisoblagichni **to'g'ridan-to'g'ri kompyuterdan** test qilish va ESP32 firmware'ni flash qilish uchun mo'ljallangan (production tarmog'idan mustaqil, dala sharoitida diagnostika uchun).

```
main.py               → ilova kirish nuqtasi
ui/main_window.py      → asosiy oyna
controllers/flash_controller.py → PlatformIO orqali firmware yuklash
services/tool_installer.py      → PlatformIO/toolchain o'rnatish
services/ (lora_decoder va h.k.) → LoRa paketlarni dekodlash (diagnostika uchun)
```

---

## 6. Deployment / Infratuzilma

- **Server**: DigitalOcean VPS (961MB RAM), SSH: `ssh -i ~/docean root@67.205.171.93`
- **Backend**: systemd service `meter-api` (uvicorn), portda 8001 (localhost), nginx orqali tashqariga
- **Domenlar**: `ss.boos.uz` (v1 frontend, static build), `sss.boos.uz` (v2 frontend, static build) — bitta backend'ga proxy
- **Database**: mahalliy PostgreSQL (bir xil serverda)
- **Deploy skripti**: `update.sh` — git pull → pip install → `alembic upgrade head` → ikkala frontend build → `systemctl restart meter-api`
- **Test infratuzilmasi**: lokal Postgres (`electr_test` — testlar uchun, `electr_dev` — lokal development uchun), CI/test'lar `DROP SCHEMA public CASCADE` orqali har safar toza holatga qaytadi

---

## 7. Ma'lum, hal qilinmagan yoki e'tibor talab qiladigan masalalar

Ko'rib chiqish uchun ro'yxat:

1. **Y2038 muammosi** — barcha `ts` ustunlari `Integer` (32-bit), 2038-yilda to'lib qoladi. Tuzatish katta migratsiya talab qiladi (`BigInteger`ga o'tish).
2. **v1/v2 sahifa nomutanosibligi** — Billing/Territory faqat v2'da, Demo faqat v1'da.
3. **EX518 hisoblagichi hali ishlamayapti** — RS-485 aloqasi o'rnatilmagan, ishlab chiqaruvchi bilan bog'lanish kerak.
4. **Passiv `relay_on` ustuni** — `Reading` jadvalida hali ham mavjud (DB'da), lekin IoT hech qachon to'ldirmaydi (real rele control funksiyasi olib tashlangandan keyin ham qoldirilgan — atayin, tarixiy ma'lumot uchun).
5. **`ip` ustuni** — `Device` javob sxemasida hali ham bor (tarixiy ko'rsatish uchun saqlangan), lekin backend endi uni faol yangilamaydi.
6. Gaz sensori: bosim (analog, 4-20mA) + oqim (flow, impuls hisoblagich GPIO26) mavjud, lekin harorat kanali suv sensori bilan bir xil holatda — `temperature_c` doim `NAN` (jismoniy sensor ulanmagan, kod tayyor lekin ishlatilmayapti).

---

*Hujjat holati: 2026-07-30 sanasidagi kod bazasi asosida yozilgan.*
