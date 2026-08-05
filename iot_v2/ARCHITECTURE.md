# iot_v2 — Bino ichi RS-485 shinasi arxitekturasi

`iot_v2` — `iot/`ning LoRa'siz versiyasi. Har bir bino WiFi/internetga ega
bo'lgani uchun LoRa radio, mesh protokol va alohida gateway qurilmalari
kerak emas — bino ichidagi sensorlar RS-485 orqali bitta "bridge" ESP32'ga
yig'iladi, bridge esa to'g'ridan-to'g'ri WiFi orqali backend'ga yuboradi.

## To'liq ulanish diagrammasi (bitta bino)

```mermaid
flowchart TB
    subgraph BUS["RS-485 shina (2 sim: A/B, daisy-chain, ikki uchida 120Ω terminatsiya)"]
        direction LR
        RSLINE["═══════════ A/B ═══════════"]
    end

    subgraph LEAFS["Bino ichidagi sensor kontrollerlar (leaf — LoRa/WiFi YO'Q)"]
        direction TB

        WLEAF["💧 Water leaf — ESP32<br/>ADS1115 (I2C: SDA21/SCL22)<br/>MAX485: RX32/TX33/DE25"]
        GLEAF["🔥 Gas leaf — ESP32<br/>ADS1115 (I2C: SDA21/SCL22)<br/>MAX485: RX32/TX33/DE25"]
        SLEAF["🌱 Soil leaf — ESP32<br/>ADC: GPIO34<br/>MAX485: RX32/TX33/DE25"]
        NDLEAF["🔊 Sound leaf — ESP32<br/>ADC: GPIO34<br/>MAX485: RX32/TX33/DE25"]
    end

    WLEAF <-.->|"A/B"| RSLINE
    GLEAF <-.->|"A/B"| RSLINE
    SLEAF <-.->|"A/B"| RSLINE
    NDLEAF <-.->|"A/B"| RSLINE

    RSLINE <-.->|"A/B (bridge = master)"| BRPORT["Bridge RS-485 port<br/>Serial1: RX32/TX33/DE25<br/>@19200 baud"]

    subgraph BRIDGE["Bridge ESP32 (bino boshqaruvchisi)"]
        direction TB
        BRPORT --> BRCORE["Bridge firmware<br/>1) Har 20s: A/B'ga POLL yuboradi<br/>2) Leaf javob JSON'larini yig'adi<br/>3) O'z elektr hisoblagichini o'qiydi"]
        DLMSPORT["Serial2 (DLMS)<br/>RX16/TX17/DE4<br/>@9600/4800 baud"] --> BRCORE
        BRCORE --> WIFI["WiFi radio<br/>(ESP32 ichki)"]
    end

    METER["⚡ TE71/TE73 hisoblagich"] <-->|"RS-485/DLMS/HDLC"| DLMSPORT

    WIFI ==>|"HTTP POST /api/readings<br/>(X-Device-Token)"| API["FastAPI backend<br/>(ss.boos.uz)"]
    API --> DB[("PostgreSQL")]
    API -.->|"WebSocket"| WEB["React dashboard"]

    classDef leaf fill:#e8f4ff,stroke:#4a90d9,color:#000
    classDef bus fill:#fdf6e3,stroke:#b58900,color:#000
    classDef bridge fill:#fff3cd,stroke:#d9a441,color:#000
    classDef server fill:#e6f9e6,stroke:#4aa54a,color:#000
    classDef meter fill:#fde2e2,stroke:#c0392b,color:#000

    class WLEAF,GLEAF,SLEAF,NDLEAF leaf
    class RSLINE bus
    class BRPORT,BRCORE,DLMSPORT,WIFI bridge
    class API,DB,WEB server
    class METER meter
```

## Shahar miqyosida (ko'p bino)

```mermaid
flowchart TB
    subgraph B1["Bino #1"]
        BR1["Bridge ESP32"]
    end
    subgraph B2["Bino #2 ... #30"]
        BR2["Bridge ESP32"]
    end

    BR1 -- "WiFi HTTP POST" --> API["FastAPI backend"]
    BR2 -- "WiFi HTTP POST" --> API
    API --> DB[("PostgreSQL")]
    API --> WEB["React dashboard"]
```

Har bino — mustaqil: o'z WiFi/internetiga, o'z bridge'iga ega. Bridge'lar
bir-biri bilan gaplashmaydi, hech qanday mesh/relay yo'q — bu LoRa
arxitekturasidan asosiy farq.

## Texnik tayanch nuqtalar

- **Leaf'lar generik/"ahmoq"** — qaysi binoda ekanini bilmaydi, faqat
  sensordan o'qib RS-485'ga JSON chiqaradi. Barcha leaf bir xil pinlarda
  ishlaydi (RX32/TX33/DE25, 19200 baud) — bitta vaqtda faqat bittasi
  gapiradi (bridge navbat bilan so'raydi, `RS485_POLL_BYTE` broadcast).
- **Bridge — ikkita mustaqil UART**:
  - `Serial1` — yangi RS-485 leaf shinasi (`rs485_bus.h`)
  - `Serial2` — eski, ishlab turgan DLMS elektr hisoblagich liniyasi
    (`sensors/dlms.h`, RX16/TX17/DE4) — bunga tegilmagan
- **LoRa yo'q** — bridge to'g'ridan-to'g'ri WiFi orqali `/api/readings`ga
  POST qiladi (mavjud offline-bufer/retry mexanizmi bilan, xuddi oddiy
  WiFi sensorlardagi kabi).
- **JSON format** — leaf `sensor_build_json()` (mavjud, `sensors/*.h`) bilan
  bir xil JSON'ni quradi; bridge faqat NTP timestamp qo'shib, o'zgarishsiz
  forward qiladi. Backend/gateway kod darajasida hech narsa o'zgarmagan.

## Fayllar

| Fayl | Vazifa |
|---|---|
| `include/rs485_bus.h` | Past darajali RS-485 freym yuborish/qabul qilish |
| `include/rs485_leaf.h` | Leaf firmware (`-DRS485_LEAF`) |
| `include/rs485_bridge.h` | Bridge qo'shimchasi (`-DRS485_BRIDGE`) |
| `platformio.ini` | `water_rs485_leaf`, `gas_rs485_leaf`, `soil_rs485_leaf`, `sound_rs485_leaf`, `building_bridge` environmentlari |
