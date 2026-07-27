#pragma once
/**
 * lora_node.h — LoRa MESH Node firmware (WiFi YO'Q)
 *
 * Barcha sensor turlarini qo'llab-quvvatlaydi:
 *   SENSOR_SOIL        → LoRaSoilUplink  (16 bayt)
 *   SENSOR_SOUND       → LoRaSoundUplink (16 bayt)
 *   SENSOR_WATER       → LoRaWaterUplink (26 bayt)
 *   SENSOR_GAS         → LoRaGasUplink   (24 bayt)
 *   SENSOR_ELECTRICITY → LoRaUplink      (51 bayt, maxsus DLMS/relay/downlink)
 *
 * ── MESH v2 oqimi ────────────────────────────────────────────────────────────
 *   1. Sensor o'qiladi → paket (seq bilan) → TX
 *   2. Gateway dan ACK kutiladi (LORA_ACK_WAIT_MS, relaylar orqali ham)
 *   3. ACK kelmasa LORA_TX_RETRIES marta qayta uriniladi
 *   4. Baribir kelmasa paket lokal buferda saqlanadi va keyinroq qayta
 *      yuboriladi (store-and-forward) — gateway qaytganda ma'lumot yetadi
 *   5. Bo'sh vaqtda node boshqa nodelarning paketlarini relay qiladi
 *      (TTL flood) — har paket mavjud har qanday yo'l orqali gatewayga boradi
 *
 * Build:
 *   pio run -e soil_lora / sound_lora / water_lora / gas_lora / electricity_lora
 */

#include <Arduino.h>
#include <esp_system.h>
#include <Preferences.h>
#include "core/log.h"
#include "core/watchdog.h"

// ─── Minimal config (WiFi/HTTP yo'q) ─────────────────────────────────────────
struct AppConfig { bool test_mode; };
static AppConfig g_cfg = { false };

// ─── Sensor tanlash ───────────────────────────────────────────────────────────
#if defined(SENSOR_SOIL)
  #include "sensors/soil.h"
  #define NODE_SENSOR_NAME "Tuproq"
#elif defined(SENSOR_SOUND)
  #include "sensors/sound.h"
  #define NODE_SENSOR_NAME "Ovoz"
#elif defined(SENSOR_WATER)
  #include "sensors/water.h"
  #define NODE_SENSOR_NAME "Suv"
#elif defined(SENSOR_GAS)
  #include "sensors/gas.h"
  #define NODE_SENSOR_NAME "Gaz"
#elif defined(SENSOR_ELECTRICITY)
  #include "sensors/electricity.h"
  #define NODE_SENSOR_NAME "Elektr"
#else
  #define SENSOR_ELECTRICITY
  #include "sensors/electricity.h"
  #define NODE_SENSOR_NAME "Elektr"
#endif
#include "lora_packet.h"
#include "lora_mesh.h"

// ─── Display ─────────────────────────────────────────────────────────────────
#if defined(HAVE_LCD) && defined(SENSOR_SOIL)
  #include "display/disp_soil.h"
#elif defined(HAVE_LCD) && defined(SENSOR_SOUND)
  #include "display/disp_sound.h"
#elif defined(HAVE_LCD) && defined(SENSOR_ELECTRICITY)
  #include "display/disp_elec.h"
#else
  #include "display/disp_none.h"
#endif

// ─── Konstantalar ─────────────────────────────────────────────────────────────
#ifndef READ_INTERVAL_MS
  #define READ_INTERVAL_MS  30000UL
#endif
#define NODE_READ_MS        READ_INTERVAL_MS
#define NODE_PENDING_SIZE   8         // Yetkazilmagan paketlar buferi
#define NODE_PENDING_RETRY_MS 20000UL // Buferni qayta urinish oralig'i
#define NODE_MAX_PKT        64

// ─── Node holati ──────────────────────────────────────────────────────────────
static uint8_t       node_mac[6];
static char          node_id[20];
static unsigned long node_last_ms  = 0;
static int           node_pending_relay = 0;  // elektr: downlink relay buyrug'i

// int16 saturatsiya — overflow da qiymat teskari ishorada chiqib ketmasligi uchun
// (masalan 40A × 1000 = 40000 → -25536 bo'lib qolardi)
static inline int16_t lora_sat16(float v) {
    if (v >= 32767.0f)  return 32767;
    if (v <= -32768.0f) return -32768;
    return (int16_t)v;
}

// ─── Store-and-forward bufer ─────────────────────────────────────────────────
// ACK olinmagan (gateway yetib bormagan) paketlar shu yerda kutadi.
// Paket TAYYOR (seq + shifrlangan) holda saqlanadi — qayta TX arzon.
struct PendingPkt {
    uint8_t buf[NODE_MAX_PKT];
    uint8_t len;
    bool    used;
};
static PendingPkt    node_pending[NODE_PENDING_SIZE];
static int           node_pending_count = 0;
static unsigned long node_pending_last_try = 0;

static void node_pending_push(const uint8_t* pkt, size_t len) {
    if (len > NODE_MAX_PKT) return;
    // Bo'sh joy qidirish; to'la bo'lsa eng birinchi slotni qurbon qilamiz
    int slot = -1;
    for (int i = 0; i < NODE_PENDING_SIZE; i++)
        if (!node_pending[i].used) { slot = i; break; }
    if (slot < 0) {
        slot = 0;
        LOG_PRINTLN("BUFER TO'LA: eng eski paket o'chirildi");
        node_pending_count--;
    }
    memcpy(node_pending[slot].buf, pkt, len);
    node_pending[slot].len  = (uint8_t)len;
    node_pending[slot].used = true;
    node_pending_count++;
    LOG_PRINTF("Buferga saqlandi (%d/%d) — gateway javob bermadi\n",
               node_pending_count, NODE_PENDING_SIZE);
}

// ─── Mesh pump: tinglash + relay + downlink + ACK matching ───────────────────
// duration davomida efirni tinglaydi:
//   - boshqalarning paketlari → dedup → relay (TTL flood)
//   - o'zimizga kelgan ACK → wait_type/wait_seq mos bo'lsa true (darhol qaytadi)
//   - o'zimizga kelgan downlink (elektr) → node_pending_relay + ACK javob
static bool mesh_pump(unsigned long duration_ms,
                      uint8_t wait_type = 0, uint32_t wait_seq = 0) {
#ifdef SKIP_LORA_INIT
    (void)duration_ms; (void)wait_type; (void)wait_seq;
    return false;
#else
    LoRa.receive();
    bool acked = false;
    unsigned long start = millis();
    while (millis() - start < duration_ms) {
        wdt_feed();
        int sz = LoRa.parsePacket();
        if (sz >= (int)(LORA_HDR_LEN + 2) && sz <= NODE_MAX_PKT) {
            uint8_t buf[NODE_MAX_PKT];
            LoRa.readBytes(buf, sz);

            bool mine = (memcmp(buf + 1, mesh_self_mac, 6) == 0);

            if (mine) {
                if (buf[0] == PKT_ACK && sz == (int)sizeof(LoRaAck)) {
                    if (mesh_dedup_seen(buf, sz)) continue;
                    LoRaAck ack; memcpy(&ack, buf, sizeof(ack));
                    if (lora_decrypt_pkt((uint8_t*)&ack, sizeof(ack))) {
                        mesh_dedup_record(buf, sz);
                        if (wait_type && ack.ack_type == wait_type && ack.seq == wait_seq) {
                            acked = true;
                            LOG_PRINTF("ACK qabul qilindi (seq=%lu)\n",
                                       (unsigned long)wait_seq);
                            break;
                        }
                    }
                }
#if defined(SENSOR_ELECTRICITY)
                else if (buf[0] == PKT_DOWNLINK && sz == (int)sizeof(LoRaDownlink)) {
                    if (mesh_dedup_seen(buf, sz)) {
                        // Takror downlink — bizning ACK yo'qolgan, qayta tasdiqlaymiz
                        mesh_send_ack(buf + 1, lora_hdr_seq(buf), PKT_DOWNLINK);
                        continue;
                    }
                    LoRaDownlink dl; memcpy(&dl, buf, sizeof(dl));
                    if (lora_decrypt_pkt((uint8_t*)&dl, sizeof(dl)) && dl.relay_cmd > 0) {
                        mesh_dedup_record(buf, sz);
                        node_pending_relay = dl.relay_cmd;
                        LOG_PRINTF("LoRa RX: relay_cmd=%d (%s)\n",
                                   dl.relay_cmd, dl.relay_cmd == 2 ? "ON" : "OFF");
                        mesh_send_ack(dl.mac, dl.seq, PKT_DOWNLINK);
                        LoRa.receive();
                    }
                }
#endif
                // o'z uplink echomiz — e'tiborsiz (relay qilinmaydi)
            } else {
                // Boshqa nodeniki — mesh davom etsin (dedup + relay)
                if (mesh_dedup_seen(buf, sz)) continue;
                mesh_dedup_record(buf, sz);
                mesh_relay(buf, sz);
                LoRa.receive();
            }
        }
        yield();
    }
    return acked;
#endif
}

// ─── Ishonchli yuborish: TX → ACK kutish → retry ─────────────────────────────
static bool mesh_send_reliable(uint8_t* pkt, size_t len) {
#ifdef SKIP_LORA_INIT
    (void)pkt; (void)len;
    return true;
#else
    uint8_t  type = pkt[0];
    uint32_t seq  = lora_hdr_seq(pkt);
    // O'z paketimizni dedup ga yozamiz — qo'shnilar relay qilgan nusxasi
    // qaytib kelsa qayta ishlanmasin
    mesh_dedup_record(pkt, len);
    for (int attempt = 0; attempt <= LORA_TX_RETRIES; attempt++) {
        if (attempt > 0)
            LOG_PRINTF("ACK yo'q — qayta urinish %d/%d\n", attempt, LORA_TX_RETRIES);
        mesh_tx_raw(pkt, len);
        if (mesh_pump(LORA_ACK_WAIT_MS, type, seq)) return true;
    }
    return false;
#endif
}

// Yuborish + muvaffaqiyatsiz bo'lsa buferga saqlash
static void node_submit(uint8_t* pkt, size_t len) {
    if (mesh_send_reliable(pkt, len)) {
        LOG_PRINTLN("LoRa TX: OK (ACK bilan tasdiqlandi)");
    } else {
        node_pending_push(pkt, len);
    }
}

// Buferdagi eski paketlarni qayta urinish (har NODE_PENDING_RETRY_MS)
static void node_pending_retry() {
    if (node_pending_count == 0) return;
    unsigned long now = millis();
    if (now - node_pending_last_try < NODE_PENDING_RETRY_MS) return;
    node_pending_last_try = now;
    for (int i = 0; i < NODE_PENDING_SIZE; i++) {
        if (!node_pending[i].used) continue;
        LOG_PRINTF("Buferdan qayta yuborish (seq=%lu)...\n",
                   (unsigned long)lora_hdr_seq(node_pending[i].buf));
        if (mesh_send_reliable(node_pending[i].buf, node_pending[i].len)) {
            node_pending[i].used = false;
            node_pending_count--;
            LOG_PRINTF("Buferdan yetkazildi (%d qoldi)\n", node_pending_count);
        } else {
            return;  // gateway hali yo'q — keyingi safar davom etamiz
        }
    }
}

// =============================================================================
// ODDIY SENSORLAR (soil, sound, water, gas)
// =============================================================================
#if !defined(SENSOR_ELECTRICITY)

// ─── Paket qurish va yuborish ────────────────────────────────────────────────
#if defined(SENSOR_SOIL)
static void node_send(const SensorData& d) {
    LoRaSoilUplink pkt;
    memset(&pkt, 0, sizeof(pkt));
    pkt.pkt_type = PKT_UPLINK_SOIL;
    memcpy(pkt.mac, node_mac, 6);
    pkt.flags    = lora_flags_make(g_cfg.test_mode);
    pkt.seq      = mesh_next_seq();
    pkt.humidity = lora_sat16(d.humidity * 100.0f);
    lora_encrypt_pkt((uint8_t*)&pkt, sizeof(pkt));

    LOG_PRINTF("LoRa TX -> [%s] seq=%lu namlik=%.1f%% (%d bayt)\n",
               node_id, (unsigned long)pkt.seq, d.humidity, (int)sizeof(pkt));
    node_submit((uint8_t*)&pkt, sizeof(pkt));
}

#elif defined(SENSOR_SOUND)
static void node_send(const SensorData& d) {
    LoRaSoundUplink pkt;
    memset(&pkt, 0, sizeof(pkt));
    pkt.pkt_type = PKT_UPLINK_SOUND;
    memcpy(pkt.mac, node_mac, 6);
    pkt.flags    = lora_flags_make(g_cfg.test_mode);
    pkt.seq      = mesh_next_seq();
    pkt.level    = lora_sat16(d.level * 100.0f);
    lora_encrypt_pkt((uint8_t*)&pkt, sizeof(pkt));

    LOG_PRINTF("LoRa TX -> [%s] seq=%lu ovoz=%.1f%% (%d bayt)\n",
               node_id, (unsigned long)pkt.seq, d.level, (int)sizeof(pkt));
    node_submit((uint8_t*)&pkt, sizeof(pkt));
}

#elif defined(SENSOR_WATER)
static void node_send(const SensorData& d) {
    LoRaWaterUplink pkt;
    memset(&pkt, 0, sizeof(pkt));
    pkt.pkt_type = PKT_UPLINK_WATER;
    memcpy(pkt.mac, node_mac, 6);
    pkt.flags    = lora_flags_make(g_cfg.test_mode);
    pkt.seq      = mesh_next_seq();
    pkt.p_bottom = lora_sat16(d.pressure_bottom_bar * 1000.0f);
    pkt.p_top    = lora_sat16(d.pressure_top_bar * 1000.0f);
    pkt.flow     = lora_sat16(d.flow_rate * 100.0f);
    pkt.volume   = (int32_t)(d.volume_m3 * 1000.0f);
    if (!isnan(d.temperature_c))
        pkt.temp = lora_sat16(d.temperature_c * 100.0f);
    lora_encrypt_pkt((uint8_t*)&pkt, sizeof(pkt));

    LOG_PRINTF("LoRa TX -> [%s] seq=%lu suv p=%.3f/%.3f oqim=%.1f hajm=%.3f (%d bayt)\n",
               node_id, (unsigned long)pkt.seq, d.pressure_bottom_bar,
               d.pressure_top_bar, d.flow_rate, d.volume_m3, (int)sizeof(pkt));
    node_submit((uint8_t*)&pkt, sizeof(pkt));
}

#elif defined(SENSOR_GAS)
static void node_send(const SensorData& d) {
    LoRaGasUplink pkt;
    memset(&pkt, 0, sizeof(pkt));
    pkt.pkt_type = PKT_UPLINK_GAS;
    memcpy(pkt.mac, node_mac, 6);
    pkt.flags    = lora_flags_make(g_cfg.test_mode);
    pkt.seq      = mesh_next_seq();
    pkt.pressure = lora_sat16(d.pressure_bar * 1000.0f);
    pkt.flow     = lora_sat16(d.flow_rate * 1000.0f);
    pkt.volume   = (int32_t)(d.volume_m3 * 1000.0f);
    if (!isnan(d.temperature_c))
        pkt.temp = lora_sat16(d.temperature_c * 100.0f);
    lora_encrypt_pkt((uint8_t*)&pkt, sizeof(pkt));

    LOG_PRINTF("LoRa TX -> [%s] seq=%lu gaz p=%.3f oqim=%.3f hajm=%.3f (%d bayt)\n",
               node_id, (unsigned long)pkt.seq, d.pressure_bar, d.flow_rate,
               d.volume_m3, (int)sizeof(pkt));
    node_submit((uint8_t*)&pkt, sizeof(pkt));
}
#endif  // SENSOR_*

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
#if CORE_DEBUG_LEVEL > 0 || defined(APP_DEBUG)
    Serial.begin(115200);
    unsigned long _t = millis(); while (millis() - _t < 200) yield();
#endif
    esp_read_mac(node_mac, ESP_MAC_WIFI_STA);
    snprintf(node_id, sizeof(node_id), "%02X%02X%02X%02X%02X%02X",
             node_mac[0], node_mac[1], node_mac[2],
             node_mac[3], node_mac[4], node_mac[5]);

    LOG_PRINTLN();
    LOG_PRINTLN("╔══════════════════════════════════════════╗");
    LOG_PRINTLN("║  Meter Monitor v" FW_VERSION " — LoRa MESH NODE ║");
    LOG_PRINTF( "║  WiFi YO'Q | %-28s║\n", NODE_SENSOR_NAME " + LoRa 433MHz");
    LOG_PRINTLN("╚══════════════════════════════════════════╝");
    LOG_PRINTF("Node ID: %s\n", node_id);

    mesh_init(node_mac);
    LOG_PRINTF("Mesh seq: %lu dan davom etadi\n", (unsigned long)mesh_seq);

    LOG_PRINT("LoRa SX1278 init...");
#ifdef SKIP_LORA_INIT
    LOG_PRINTLN(" [SKIP_LORA_INIT] - serial test only");
#else
    if (!lora_init()) {
        LOG_PRINTLN(" XATO! Modul topilmadi.");
        LOG_PRINTF("  Ulanishni tekshiring: CS=%d RST=%d DIO0=%d\n",
                   LORA_PIN_CS, LORA_PIN_RST, LORA_PIN_IRQ);
        while (true) yield();
    }
    LOG_PRINTF(" OK (433MHz, SF%d, BW%.0fkHz, PWR=%ddBm)\n",
               LORA_SF, LORA_BW / 1000.0, LORA_TX_PWR);
#endif

    disp_init();
    sensor_init();

    LOG_PRINTLN();
    LOG_PRINTLN("┌──────────────────────────────────────────┐");
    LOG_PRINTF( "│  Node ID  : %-28s│\n", node_id);
    LOG_PRINTF( "│  Sensor   : %-28s│\n", NODE_SENSOR_NAME);
    {
        char _iv[29];
        snprintf(_iv, sizeof(_iv), "%lu s", NODE_READ_MS / 1000);
        LOG_PRINTF("│  Interval : %-28s│\n", _iv);
    }
    LOG_PRINTLN("└──────────────────────────────────────────┘");

    ota_mark_valid();
    wdt_init();
    LOG_PRINTLN("Tayyor!\n");
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
void loop() {
    wdt_feed();
    unsigned long now = millis();

    // Sensor o'qish vaqti kelmagan bo'lsa — relay tinglash + bufer retry
    if (node_last_ms != 0 && now - node_last_ms < NODE_READ_MS) {
        mesh_pump(LORA_RELAY_LISTEN_MS);  // Bo'sh vaqtda mesh relay
        node_pending_retry();             // Yetkazilmaganlarni qayta urinish
        return;
    }
    node_last_ms = now;

    SensorData d;
    if (!sensor_read(d) || !d.valid) {
        LOG_PRINTLN("Sensor o'qish xato");
        return;
    }
    disp_show_reading(d);
#ifndef SKIP_LORA_INIT
    node_send(d);
    mesh_pump(LORA_RELAY_LISTEN_MS);  // TX dan keyin ham mesh relay
#else
    LOG_PRINTLN("[SKIP] Sensor read OK (LoRa o'chirilgan)");
    unsigned long _st = millis(); while (millis() - _st < 5000) yield();
#endif
}

// =============================================================================
// ELEKTR HISOBLAGICH (maxsus DLMS/relay/downlink)
// =============================================================================
#else  // SENSOR_ELECTRICITY

#define NODE_METER_MAX_MS   300000UL   // Elektr: maksimal retry interval

static int           node_fail_count    = 0;
static unsigned long node_retry_ms      = NODE_READ_MS;

static void node_send_uplink(const SensorData& d) {
    LoRaUplink pkt;
    memset(&pkt, 0, sizeof(pkt));

    pkt.pkt_type = PKT_UPLINK;
    memcpy(pkt.mac, node_mac, 6);
    pkt.flags = LORA_TTL_DEFAULT << LORA_TTL_SHIFT;
    if (strcmp(d.sensor_type, "te73") == 0) pkt.flags |= 0x01;
    if (g_cfg.test_mode) pkt.flags |= 0x02;  // elektr: bit1=test_mode (bit0=te73 band)
    pkt.seq = mesh_next_seq();

    strncpy(pkt.meter_serial, d.meter_serial, 12);
    pkt.meter_serial[12] = '\0';

    if (!isnan(d.voltage_l1)) pkt.v_l1      = lora_sat16(d.voltage_l1 * 100.0f);
    if (!isnan(d.voltage_l2)) pkt.v_l2      = lora_sat16(d.voltage_l2 * 100.0f);
    if (!isnan(d.voltage_l3)) pkt.v_l3      = lora_sat16(d.voltage_l3 * 100.0f);
    // Tok mA da: 32.767A dan katta toklar uchun saturatsiya (int16 chegarasi)
    if (!isnan(d.current_l1)) pkt.i_l1      = lora_sat16(d.current_l1 * 1000.0f);
    if (!isnan(d.current_l2)) pkt.i_l2      = lora_sat16(d.current_l2 * 1000.0f);
    if (!isnan(d.current_l3)) pkt.i_l3      = lora_sat16(d.current_l3 * 1000.0f);
    if (!isnan(d.power_w))    pkt.power_w   = (int32_t)d.power_w;
    if (!isnan(d.frequency))  pkt.freq_chz  = lora_sat16(d.frequency * 100.0f);
    if (!isnan(d.energy_kwh)) pkt.energy_wh = (int32_t)(d.energy_kwh * 1000.0f);
    if (!isnan(d.pf))         pkt.pf_pct    = lora_sat16(d.pf * 100.0f);

    LOG_PRINTF("LoRa TX -> [%s] seq=%lu V=%.1fV P=%dW E=%.3fkWh (%d bayt)\n",
               d.meter_serial, (unsigned long)pkt.seq,
               isnan(d.voltage_l1) ? 0.0f : d.voltage_l1,
               isnan(d.power_w) ? 0 : (int)d.power_w,
               isnan(d.energy_kwh) ? 0.0f : d.energy_kwh,
               (int)sizeof(pkt));

    lora_encrypt_pkt((uint8_t*)&pkt, sizeof(pkt));
    node_submit((uint8_t*)&pkt, sizeof(pkt));
}

void setup() {
#if CORE_DEBUG_LEVEL > 0 || defined(APP_DEBUG)
    Serial.begin(115200);
    unsigned long _t = millis(); while (millis() - _t < 200) yield();
#endif
    esp_read_mac(node_mac, ESP_MAC_WIFI_STA);
    snprintf(node_id, sizeof(node_id), "%02X%02X%02X%02X%02X%02X",
             node_mac[0], node_mac[1], node_mac[2],
             node_mac[3], node_mac[4], node_mac[5]);

    LOG_PRINTLN();
    LOG_PRINTLN("╔══════════════════════════════════════════╗");
    LOG_PRINTLN("║  Meter Monitor v" FW_VERSION " — LoRa NODE      ║");
    LOG_PRINTLN("║  WiFi YO'Q | RS-485 + LoRa 433MHz       ║");
    LOG_PRINTLN("╚══════════════════════════════════════════╝");
    LOG_PRINTF("Node ID: %s\n", node_id);

    mesh_init(node_mac);
    LOG_PRINTF("Mesh seq: %lu dan davom etadi\n", (unsigned long)mesh_seq);

    LOG_PRINT("LoRa SX1278 init...");
    if (!lora_init()) {
        LOG_PRINTLN(" XATO! Modul topilmadi.");
        LOG_PRINTF("  Ulanishni tekshiring: CS=%d RST=%d DIO0=%d\n",
                   LORA_PIN_CS, LORA_PIN_RST, LORA_PIN_IRQ);
        while (true) yield();
    }
    LOG_PRINTF(" OK (433MHz, SF%d, BW%.0fkHz, PWR=%ddBm)\n",
               LORA_SF, LORA_BW / 1000.0, LORA_TX_PWR);

    sensor_init();
    LOG_PRINT("Meter ulanmoqda:");
    bool found = false;
    for (int i = 1; i <= 3 && !found; i++) {
        LOG_PRINTF(" %d/3...", i);
        if (sensor_connect()) {
            dlms_get_string(1, OBIS_SERIAL, 2,
                            g_sensor_meta.meter_serial,
                            sizeof(g_sensor_meta.meter_serial));
            sensor_detect_type();
            LOG_PRINTF(" OK [%s / %s]\n",
                       g_sensor_meta.meter_serial,
                       g_sensor_meta.sensor_type);
            found = true;
        } else {
            unsigned long _w = millis(); while (millis() - _w < 500) yield();
        }
    }
    if (!found) LOG_PRINTLN(" XATO — meter topilmadi, loop da qayta urinadi");

    LOG_PRINTLN();
    LOG_PRINTLN("┌──────────────────────────────────────────┐");
    LOG_PRINTF( "│  Node ID    : %-26s│\n", node_id);
    LOG_PRINTF( "│  Hisoblagich: %-26s│\n",
        g_sensor_meta.meter_serial[0] ? g_sensor_meta.meter_serial : "topilmadi");
    LOG_PRINTF( "│  Tur        : %-26s│\n",
        g_sensor_meta.sensor_type[0] ? g_sensor_meta.sensor_type : "aniqlanmadi");
    LOG_PRINTLN("└──────────────────────────────────────────┘");
    ota_mark_valid();
    wdt_init();
    LOG_PRINTLN("Tayyor!\n");
}

void loop() {
    wdt_feed();
    unsigned long now = millis();
    bool read_time = (now - node_last_ms >= node_retry_ms || node_last_ms == 0);
    if (!read_time) {
        mesh_pump(LORA_RELAY_LISTEN_MS);  // Bo'sh vaqtda mesh relay + downlink
        node_pending_retry();
        return;
    }
    node_last_ms = now;

    if (!dlms_connected) {
        LOG_PRINT("Meter reconnect...");
        if (!sensor_connect()) {
            LOG_PRINTLN(" XATO");
            node_fail_count++;
            if (node_fail_count >= 3) {
                node_retry_ms = min(node_retry_ms * 2, NODE_METER_MAX_MS);
                LOG_PRINTF("Keyingi urinish %lu s keyin\n", node_retry_ms / 1000);
            }
            return;
        }
        node_fail_count = 0;
        node_retry_ms   = NODE_READ_MS;
        LOG_PRINTLN(" OK");
        if (!g_sensor_meta.meter_serial[0])
            dlms_get_string(1, OBIS_SERIAL, 2,
                            g_sensor_meta.meter_serial,
                            sizeof(g_sensor_meta.meter_serial));
        if (!g_sensor_meta.sensor_type[0]) sensor_detect_type();
    }

    if (node_pending_relay) {
        bool ok = sensor_relay(node_pending_relay);
        LOG_PRINTF("Relay %s: %s\n",
                   node_pending_relay == 2 ? "ON" : "OFF", ok ? "OK" : "XATO");
        node_pending_relay = 0;
    }

    SensorData d;
    if (!sensor_read(d)) {
        LOG_PRINTLN("O'qish xato — meter sessiyasi uzildi");
        dlms_disconnect();
        return;
    }

    node_send_uplink(d);
    mesh_pump(LORA_RELAY_LISTEN_MS);  // TX dan keyin mesh relay + downlink
    dlms_disconnect();
}

#endif  // !SENSOR_ELECTRICITY
