#pragma once
/**
 * lora_packet.h — LoRa MESH paket formati v2 (Node ↔ Node ↔ Gateway)
 *
 * SX1278 (Ra-02) ESP32 ga ulanish:
 *   Ra-02 MOSI → ESP32 GPIO23
 *   Ra-02 MISO → ESP32 GPIO19
 *   Ra-02 SCK  → ESP32 GPIO18
 *   Ra-02 NSS  → ESP32 GPIO5  (node default; gateway -DLORA_PIN_CS=15)
 *   Ra-02 RST  → ESP32 GPIO14
 *   Ra-02 DIO0 → ESP32 GPIO2
 *   Ra-02 3.3V → ESP32 3.3V
 *   Ra-02 GND  → ESP32 GND
 *
 * ── MESH v2 arxitekturasi ────────────────────────────────────────────────────
 * Har paketda umumiy OCHIQ header (12 bayt):
 *   [pkt_type(1)][mac(6)][flags(1)][seq(4)]
 *   - mac  = paket EGASI (uplink: node)
 *   - seq  = egasining o'sib boruvchi hisoblagichi (NVS da saqlanadi)
 *   - flags: bit0/bit1 sensor-maxsus, bit4-6 = TTL
 *
 * Relay (har qanday node):
 *   - dedup kaliti (pkt_type, mac, seq) — OCHIQ, deshifrlash SHART EMAS
 *   - TTL>0 bo'lsa TTL-- qilib qayta uzatadi (flood, internet tori kabi
 *     paket mavjud har qanday yo'l orqali manzilga yetadi)
 *   - CRC TTL bitlarini 0 deb hisoblaydi → TTL o'zgarsa CRC buzilmaydi
 *
 * Ishonchli yetkazish:
 *   - Gateway qabul qilgach LoRaAck yuboradi (relaylar orqali qaytadi)
 *   - Node ACK kutadi, kelmasa retry, baribir bo'lmasa buferda saqlab
 *     keyinroq qayta yuboradi (store-and-forward)
 *   - Bir nechta gateway bo'lsa qaysi biri qabul qila olsa o'sha ACK beradi;
 *     server duplikatlarni reading_id="MAC-seq" orqali tashlaydi
 *
 * Shifrlash (lora_crypto.h): payload offset 12 dan, nonce = MAC+type+seq+blk
 */

#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>

// ─── SX1278 SPI pinlari ───────────────────────────────────────────────────────
#ifndef LORA_PIN_CS
  #define LORA_PIN_CS   5
#endif
#define LORA_PIN_RST  14
#define LORA_PIN_IRQ  2

// ─── RF sozlamalari (433 MHz, O'zbekiston ISM band) ───────────────────────────
#define LORA_FREQ     433E6   // 433 MHz
#define LORA_SF       9       // Spreading Factor 9: ~1-3km shahar, ~5km ochiq
#define LORA_BW       125E3   // Bandwidth 125 kHz
#define LORA_CR       5       // Coding Rate 4/5
// TX power dBm. Default 2 (stol testi, antena yo'q — PA himoyasi).
// Antenali production qurilmada build flag bilan oshiring: -DLORA_TX_PWR=17
#ifndef LORA_TX_PWR
  #define LORA_TX_PWR   2
#endif
#define LORA_SYNC     0xAB    // Sync word (tarmoq ajratuvchi, 0x12 = LoRaWAN)

// ─── Umumiy header ────────────────────────────────────────────────────────────
#define LORA_HDR_LEN     12   // type(1) + mac(6) + flags(1) + seq(4)
#define LORA_OFF_FLAGS    7
#define LORA_OFF_SEQ      8

// ─── Mesh TTL (flags baytida, bit 4-6) ────────────────────────────────────────
#define LORA_TTL_MASK    0x70   // bit 4,5,6
#define LORA_TTL_SHIFT   4
#ifndef LORA_TTL_DEFAULT
  #define LORA_TTL_DEFAULT 3    // 3 hop (ko'p bino uchun yetarli)
#endif
#define LORA_RELAY_LISTEN_MS  2000  // TX dan keyin relay tinglash vaqti (ms)
#define LORA_ACK_WAIT_MS      2500  // ACK kutish oynasi (3 hop RTT ga yetadi)
#define LORA_TX_RETRIES       2     // ACK kelmasa qo'shimcha urinishlar soni

static inline uint8_t lora_flags_make(bool test_mode) {
    return (test_mode ? 0x01 : 0x00) | (LORA_TTL_DEFAULT << LORA_TTL_SHIFT);
}
static inline uint8_t lora_ttl_get(uint8_t flags) {
    return (flags & LORA_TTL_MASK) >> LORA_TTL_SHIFT;
}
static inline uint8_t lora_ttl_dec(uint8_t flags) {
    uint8_t ttl = lora_ttl_get(flags);
    if (ttl == 0) return flags;
    return (flags & ~LORA_TTL_MASK) | ((ttl - 1) << LORA_TTL_SHIFT);
}

// Ochiq headerdan seq o'qish (little-endian, packed structlar bilan mos)
static inline uint32_t lora_hdr_seq(const uint8_t* buf) {
    return (uint32_t)buf[LORA_OFF_SEQ] |
           ((uint32_t)buf[LORA_OFF_SEQ + 1] << 8) |
           ((uint32_t)buf[LORA_OFF_SEQ + 2] << 16) |
           ((uint32_t)buf[LORA_OFF_SEQ + 3] << 24);
}

// ─── Paket turlari ────────────────────────────────────────────────────────────
#define PKT_UPLINK        0x01   // Node → Gateway: elektr hisoblagich
#define PKT_UPLINK_SOIL   0x03   // Node → Gateway: tuproq namligi
#define PKT_UPLINK_SOUND  0x04   // Node → Gateway: ovoz darajasi
#define PKT_UPLINK_WATER  0x05   // Node → Gateway: suv bosim/oqim
#define PKT_UPLINK_GAS    0x06   // Node → Gateway: gaz bosim/oqim
#define PKT_ACK           0x08   // Qabul tasdiqlash (mesh orqali qaytadi)

// ─── Soil uplink ──────────────────────────────────────────────────────────────
// Jami: 16 bayt
struct __attribute__((packed)) LoRaSoilUplink {
    uint8_t  pkt_type;   // PKT_UPLINK_SOIL = 0x03
    uint8_t  mac[6];     // Node WiFi MAC adresi
    uint8_t  flags;      // bit0=test_mode, bit4-6=TTL
    uint32_t seq;        // Node paket hisoblagichi
    int16_t  humidity;   // Namlik: %×100  (8530 = 85.30%)
    uint16_t crc;
};

// ─── Sound uplink ─────────────────────────────────────────────────────────────
// Jami: 16 bayt (soil bilan bir xil hajm — pkt_type orqali farqlanadi)
struct __attribute__((packed)) LoRaSoundUplink {
    uint8_t  pkt_type;   // PKT_UPLINK_SOUND = 0x04
    uint8_t  mac[6];
    uint8_t  flags;      // bit0=test_mode, bit4-6=TTL
    uint32_t seq;
    int16_t  level;      // Ovoz: %×100  (5530 = 55.30%)
    uint16_t crc;
};

// ─── Water uplink ─────────────────────────────────────────────────────────────
// Jami: 26 bayt
struct __attribute__((packed)) LoRaWaterUplink {
    uint8_t  pkt_type;   // PKT_UPLINK_WATER = 0x05
    uint8_t  mac[6];
    uint8_t  flags;      // bit0=test_mode, bit4-6=TTL
    uint32_t seq;
    int16_t  p_bottom;   // Pastki bosim: bar×1000  (3200 = 3.200 bar)
    int16_t  p_top;      // Yuqori bosim: bar×1000
    int16_t  flow;       // Oqim: L/min×100  (1250 = 12.50 L/min)
    int32_t  volume;     // Hajm: litr  (m3×1000) (48250 = 48.250 m3)
    int16_t  temp;       // Harorat: °C×100  (1850 = 18.50°C)
    uint16_t crc;
};

// ─── Gas uplink ───────────────────────────────────────────────────────────────
// Jami: 24 bayt
struct __attribute__((packed)) LoRaGasUplink {
    uint8_t  pkt_type;   // PKT_UPLINK_GAS = 0x06
    uint8_t  mac[6];
    uint8_t  flags;      // bit0=test_mode, bit4-6=TTL
    uint32_t seq;
    int16_t  pressure;   // Bosim: bar×1000  (20 = 0.020 bar)
    int16_t  flow;       // Oqim: m3/h×1000  (1500 = 1.500 m3/h)
    int32_t  volume;     // Hajm: litr  (m3×1000)
    int16_t  temp;       // Harorat: °C×100
    uint16_t crc;
};

// ─── Electricity uplink ───────────────────────────────────────────────────────
// Qiymatlar fixed-point (float overhead va NaN muammosi yo'q)
// Jami: 51 bayt
struct __attribute__((packed)) LoRaUplink {
    uint8_t  pkt_type;          // PKT_UPLINK = 0x01
    uint8_t  mac[6];            // Node WiFi MAC adresi (qurilma ID)
    uint8_t  flags;             // bit0=te73, bit1=test_mode, bit4-6=TTL
    uint32_t seq;
    char     meter_serial[13];  // Hisoblagich seriyasi (12 char + '\0')
    int16_t  v_l1;              // Kuchlanish L1: V×100  (21532 = 215.32 V)
    int16_t  v_l2;
    int16_t  v_l3;
    int16_t  i_l1;              // Tok L1: mA (saturatsiya ±32.767A)
    int16_t  i_l2;
    int16_t  i_l3;
    int32_t  power_w;           // Aktiv quvvat: W
    int16_t  freq_chz;          // Chastota: Hz×100  (5000 = 50.00 Hz)
    int32_t  energy_wh;         // Energiya: Wh  (319830 = 319.830 kWh)
    int16_t  pf_pct;            // Power factor: ×100  (98 = 0.98)
    uint16_t crc;
};

// ─── ACK: qabul tasdiqlash ────────────────────────────────────────────────────
// Jami: 15 bayt. mac+seq = TASDIQLANAYOTGAN paketning egasi va seq raqami.
struct __attribute__((packed)) LoRaAck {
    uint8_t  pkt_type;          // PKT_ACK = 0x08
    uint8_t  mac[6];            // Tasdiqlanayotgan paket egasining MAC i
    uint8_t  flags;             // bit4-6=TTL (mesh orqali qaytishi uchun)
    uint32_t seq;               // Tasdiqlanayotgan paket seq raqami
    uint8_t  ack_type;          // Tasdiqlanayotgan paket turi (0x01, 0x03..0x06)
    uint16_t crc;
};

// ─── CRC16-CCITT (TTL bitlari maskalanadi) ────────────────────────────────────
// flags baytining TTL bitlari 0 deb hisoblanadi — relay TTL ni o'zgartirganda
// CRC ni qayta hisoblash (va qayta shifrlash) kerak bo'lmaydi.
static uint16_t lora_crc16(const uint8_t* d, size_t n) {
    uint16_t c = 0xFFFF;
    for (size_t i = 0; i < n; i++) {
        uint8_t b = d[i];
        if (i == LORA_OFF_FLAGS) b &= ~LORA_TTL_MASK;
        c ^= (uint16_t)b << 8;
        for (int j = 0; j < 8; j++)
            c = (c & 0x8000) ? (c << 1) ^ 0x1021 : (c << 1);
    }
    return c;
}

static void lora_crc_set(uint8_t* buf, size_t total) {
    uint16_t c = lora_crc16(buf, total - 2);
    buf[total - 2] = c & 0xFF;
    buf[total - 1] = c >> 8;
}

static bool lora_crc_ok(const uint8_t* buf, size_t total) {
    if (total < 2) return false;
    uint16_t rx   = buf[total-2] | ((uint16_t)buf[total-1] << 8);
    uint16_t calc = lora_crc16(buf, total - 2);
    return rx == calc;
}

// ─── LoRa kripto (CRC funksiyalaridan keyin) ─────────────────────────────────
#include "lora_crypto.h"

// ─── LoRa init (ham node, ham gateway) ───────────────────────────────────────
static bool lora_init() {
    LoRa.setPins(LORA_PIN_CS, LORA_PIN_RST, LORA_PIN_IRQ);
    if (!LoRa.begin(LORA_FREQ)) return false;
    LoRa.setSpreadingFactor(LORA_SF);
    LoRa.setSignalBandwidth(LORA_BW);
    LoRa.setCodingRate4(LORA_CR);
    LoRa.setTxPower(LORA_TX_PWR);
    LoRa.setSyncWord(LORA_SYNC);
    return true;
}
