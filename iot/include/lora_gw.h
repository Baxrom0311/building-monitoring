#pragma once
/**
 * lora_gw.h — LoRa Gateway firmware
 *
 * Gateway (WiFi yonida):
 *   1. LoRa RX → Node dan sensor ma'lumot qabul
 *   2. WiFi → Backend /api/readings ga POST
 *   3. Backend /api/commands → node nomidan buyruq poll (reboot va h.k.)
 *
 * Gateway o'zi ham qurilma sifatida ro'yxatdan o'tadi.
 * Har bir node — alohida device_id (node MAC) bilan backendda ro'yxatdan o'tadi.
 *
 * Build: pio run -e lora_gateway
 */

// common.h main.cpp da LORA_GATEWAY blokida include qilinadi
// lora_packet.h ham u yerda include qilinadi
#include <ArduinoJson.h>
#include "lora_mesh.h"

// ─── LCD 16x2 I2C (ixtiyoriy) ────────────────────────────────────────────────
#ifdef HAVE_LCD
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
static LiquidCrystal_I2C* gw_lcd = nullptr;
static bool gw_lcd_ok = false;

static void gw_lcd_init() {
    Wire.begin(21, 22);
    unsigned long _t = millis(); while (millis() - _t < 50) yield();
    uint8_t addr = 0;
    for (uint8_t a : {0x27u, 0x3Fu, 0x20u, 0x38u}) {
        Wire.beginTransmission(a);
        if (Wire.endTransmission() == 0) { addr = a; break; }
    }
    if (addr) {
        gw_lcd = new LiquidCrystal_I2C(addr, 16, 2);
        gw_lcd->init();
        gw_lcd->backlight(); gw_lcd->clear();
        gw_lcd_ok = true;
        LOG_PRINTF("LCD: topildi (0x%02X)\n", addr);
    }
}

static void gw_lcd_show(uint8_t row, const char* text) {
    if (!gw_lcd_ok || !gw_lcd) return;
    char buf[17];
    snprintf(buf, sizeof(buf), "%-16s", text);
    gw_lcd->setCursor(0, row);
    gw_lcd->print(buf);
}
#else
static void gw_lcd_init() {}
static void gw_lcd_show(uint8_t, const char*) {}
#endif

// ─── Gateway konstantalar ─────────────────────────────────────────────────────
#define GW_CMD_POLL_MS    30000UL   // Har 30s da command poll
#define GW_STATUS_MS      60000UL   // Har 60s da status yuborish
#define GW_HEALTH_MS      60000UL   // Har 60s da server health check
#define GW_MAX_NODES          16    // Bir vaqtda kuzatiladigan max node soni
#define GW_BUF_SIZE            8    // Yuborish buferi hajmi
#define GW_BUF_FLUSH_MS    3000UL   // Bufer flush interval (ms)

// ─── Node holati (RAM da) ─────────────────────────────────────────────────────
struct NodeState {
    uint8_t  mac[6];
    char     device_id[20];   // "AABBCCDDEEFF"
    bool     registered;
    unsigned long last_seen;
};

static NodeState gw_nodes[GW_MAX_NODES];
static int       gw_node_count = 0;

static char          gw_id[20]       = "";
static bool          gw_server_ok    = false;
static bool          gw_registered   = false;
static unsigned long gw_last_cmd_ms  = 0;
static unsigned long gw_last_hlth_ms = 0;
static unsigned long gw_last_stat_ms = 0;
static unsigned long gw_last_flush_ms = 0;

// Dedup endi lora_mesh.h da: (pkt_type, mac, seq) bo'yicha, ochiq header
// orqali — hash ham, deshifrlash ham kerak emas.

// ─── Yuborish buferi (HTTP blocking vaqtida LoRa RX yo'qolmasin) ─────────────
struct GwBufEntry {
    String json;
    bool   needs_register;   // true = avval register, keyin readings
    uint8_t mac[6];          // register uchun node MAC
    LoRaUplink reg_pkt;      // register uchun paket (faqat elektr)
    uint8_t entry_type;      // 0=electricity, 1=soil, 2=sound, 3=water, 4=gas
    uint8_t tries;           // POST urinishlari (poison entry queue ni bloklamasin)
};

static GwBufEntry gw_buf[GW_BUF_SIZE];
static int gw_buf_head = 0;
static int gw_buf_tail = 0;
static int gw_buf_count = 0;

static bool gw_buf_push(const String& json, bool needs_reg, const uint8_t* mac,
                         const LoRaUplink* reg_pkt, uint8_t etype) {
    if (gw_buf_count >= GW_BUF_SIZE) {
        // To'la — QABUL QILMAYMIZ (ACK ham yubormaymiz): node o'zida saqlaydi
        // yoki boshqa gateway qabul qiladi. Eski ma'lumot yo'qolmaydi.
        LOG_PRINTLN("GW BUF: to'la — paket qabul qilinmadi (node qayta yuboradi)");
        return false;
    }
    GwBufEntry& e = gw_buf[gw_buf_head];
    e.json = json;
    e.needs_register = needs_reg;
    e.entry_type = etype;
    e.tries = 0;
    if (mac) memcpy(e.mac, mac, 6);
    if (reg_pkt) e.reg_pkt = *reg_pkt;
    gw_buf_head = (gw_buf_head + 1) % GW_BUF_SIZE;
    gw_buf_count++;
    return true;
}

// ─── Node topish / qo'shish ───────────────────────────────────────────────────
static NodeState* gw_find_node(const uint8_t mac[6]) {
    for (int i = 0; i < gw_node_count; i++)
        if (memcmp(gw_nodes[i].mac, mac, 6) == 0) return &gw_nodes[i];
    return nullptr;
}

static NodeState* gw_get_node(const uint8_t mac[6]) {
    NodeState* n = gw_find_node(mac);
    if (n) return n;
    if (gw_node_count >= GW_MAX_NODES) {
        LOG_PRINTLN("GW: node limit to'ldi!");
        return nullptr;
    }
    n = &gw_nodes[gw_node_count++];
    memset(n, 0, sizeof(*n));
    memcpy(n->mac, mac, 6);
    snprintf(n->device_id, sizeof(n->device_id),
             "%02X%02X%02X%02X%02X%02X",
             mac[0],mac[1],mac[2],mac[3],mac[4],mac[5]);
    LOG_PRINTF("GW: yangi node → %s\n", n->device_id);
    return n;
}

// ─── Node ni backendga ro'yxatdan o'tkazish ──────────────────────────────────
static void gw_register_electricity_node(NodeState* n, const LoRaUplink& pkt) {
    if (n->registered) return;
    bool is_te73 = (pkt.flags & 0x01) != 0;
    StaticJsonDocument<256> doc;
    doc["device_id"]        = n->device_id;
    doc["utility_type"]     = "electricity";
    doc["meter_type"]       = is_te73 ? "te73" : "te71";
    doc["meter_serial"]     = pkt.meter_serial;
    doc["software_version"] = FW_VERSION;
    doc["baud_rate"]        = 9600;
    doc["chip_model"]       = "ESP32+LoRa-Node";
    String body; serializeJson(doc, body);

    HTTPClient http;
    char url[220];
    snprintf(url, sizeof(url), "%s/api/register", g_cfg.server_url);
    if (!http_begin_url(http, url)) return;
    http.addHeader("Content-Type", "application/json");
    if (g_cfg.device_token[0])
        http.addHeader("X-Device-Token", g_cfg.device_token);
    http_prepare(http, 5000);
    int code = http.POST(body);
    if (code == 200 || code == 201) {
        n->registered = true;
        LOG_PRINTF("GW: node %s ro'yxatga olindi (electricity)\n", n->device_id);
    }
    http.end();
}

static void gw_register_simple_node(NodeState* n, const char* utility,
                                     const char* sensor_type) {
    if (n->registered) return;
    StaticJsonDocument<256> doc;
    doc["device_id"]        = n->device_id;
    doc["utility_type"]     = utility;
    doc["sensor_type"]      = sensor_type;
    doc["software_version"] = FW_VERSION;
    doc["chip_model"]       = "ESP32+LoRa-Node";
    String body; serializeJson(doc, body);

    HTTPClient http;
    char url[220];
    snprintf(url, sizeof(url), "%s/api/register", g_cfg.server_url);
    if (!http_begin_url(http, url)) return;
    http.addHeader("Content-Type", "application/json");
    if (g_cfg.device_token[0])
        http.addHeader("X-Device-Token", g_cfg.device_token);
    http_prepare(http, 5000);
    int code = http.POST(body);
    if (code == 200 || code == 201) {
        n->registered = true;
        LOG_PRINTF("GW: node %s ro'yxatga olindi (%s)\n", n->device_id, utility);
    }
    http.end();
}

// ─── Buferdagi yozuvlarni HTTP orqali yuborish ───────────────────────────────
#define GW_BUF_MAX_TRIES  5   // shundan keyin yozuv tashlanadi (poison himoya)

static void gw_buf_flush() {
    while (gw_buf_count > 0) {
        wdt_feed();  // entrylar × (register + POST) 5s timeout bilan TWDT dan oshishi mumkin
        GwBufEntry& e = gw_buf[gw_buf_tail];
        if (e.needs_register) {
            NodeState* n = gw_find_node(e.mac);
            if (n) {
                switch (e.entry_type) {
                    case 0: gw_register_electricity_node(n, e.reg_pkt); break;
                    case 1: gw_register_simple_node(n, "soil", "capacitive_soil_moisture"); break;
                    case 2: gw_register_simple_node(n, "sound", "microphone"); break;
                    case 3: gw_register_simple_node(n, "water", "ads1115_hy131"); break;
                    case 4: gw_register_simple_node(n, "gas", "gas_pulse_flow"); break;
                }
            }
        }
        bool ok = http_post("/api/readings", e.json);
        if (!ok) {
            e.tries++;
            if (e.tries < GW_BUF_MAX_TRIES) {
                // Server hozircha javob bermadi — yozuvni SAQLAB keyinroq urinamiz
                LOG_PRINTF("GW BUF: POST xato (urinish %d/%d) — keyinroq\n",
                           e.tries, GW_BUF_MAX_TRIES);
                return;
            }
            LOG_PRINTLN("GW BUF: yozuv tashlab yuborildi (limit)");
        } else {
            LOG_PRINTF("GW BUF: readings -> OK (%d qoldi)\n", gw_buf_count - 1);
        }
        e.json = "";
        gw_buf_tail = (gw_buf_tail + 1) % GW_BUF_SIZE;
        gw_buf_count--;
    }
}

// ─── Elektr uplink qabul → buferga yozish (HTTP blokirovka qilmaydi) ─────────
// true = qabul qilindi (ACK yuboriladi), false = joy yo'q (node qayta yuboradi)
// ─── Eski (v1) elektr paket moslashuvi ────────────────────────────────────────
// Mesh'dan OLDINGI firmware (seq maydoni yo'q, pf_pct=int8) 46-bayt paket
// yuboradi. Bunday eski node'larni ham qabul qilib, joriy 51-baytli LoRaUplink
// ga "tarjima" qilamiz — node'ni qayta flash qilmasdan ma'lumot yo'qolmasin.
struct __attribute__((packed)) LoRaUplinkV1 {
    uint8_t  pkt_type;          // 0x01
    uint8_t  mac[6];
    uint8_t  flags;             // bit0=te73, bit1=test (TTL yo'q)
    char     meter_serial[13];
    int16_t  v_l1, v_l2, v_l3;
    int16_t  i_l1, i_l2, i_l3;
    int32_t  power_w;
    int16_t  freq_chz;
    int32_t  energy_wh;
    int8_t   pf_pct;            // int8! (yangi formatda int16)
    uint16_t crc;
};  // Jami: 46 bayt

static LoRaUplink gw_upconvert_v1(const LoRaUplinkV1& o) {
    LoRaUplink n;
    memset(&n, 0, sizeof(n));
    n.pkt_type = o.pkt_type;
    memcpy(n.mac, o.mac, 6);
    n.flags = o.flags;
    // Eski node'da seq yo'q — reading_id barcha o'qishlarda bir xil bo'lib
    // backend ularni duplikat deb tashlamasligi uchun epoch soniyani beramiz
    // (node 5 daq'da bir yuboradi — soniya aniqligi yetarli).
    time_t _now = time(nullptr);
    n.seq = (_now > 1609459200) ? (uint32_t)_now : (uint32_t)millis();
    memcpy(n.meter_serial, o.meter_serial, 13);
    n.meter_serial[12] = '\0';
    n.v_l1 = o.v_l1; n.v_l2 = o.v_l2; n.v_l3 = o.v_l3;
    n.i_l1 = o.i_l1; n.i_l2 = o.i_l2; n.i_l3 = o.i_l3;
    n.power_w = o.power_w;
    n.freq_chz = o.freq_chz;
    n.energy_wh = o.energy_wh;
    n.pf_pct = o.pf_pct;        // int8 → int16 kengaytirish
    return n;
}

static bool gw_handle_uplink(const LoRaUplink& pkt, int rssi) {
    NodeState* node = gw_get_node(pkt.mac);
    if (!node) return false;
    node->last_seen = millis();

    bool is_te73 = (pkt.flags & 0x01) != 0;

    float v_l1   = pkt.v_l1    / 100.0f;
    float v_l2   = pkt.v_l2    / 100.0f;
    float v_l3   = pkt.v_l3    / 100.0f;
    float i_l1   = pkt.i_l1   / 1000.0f;
    float i_l2   = pkt.i_l2   / 1000.0f;
    float i_l3   = pkt.i_l3   / 1000.0f;
    float freq   = pkt.freq_chz / 100.0f;
    float energy = pkt.energy_wh / 1000.0f;
    float pf     = pkt.pf_pct  / 100.0f;

    LOG_PRINTF("GW RX ← [%s] RSSI=%ddBm V=%.1fV P=%dW E=%.3fkWh\n",
               node->device_id, rssi, v_l1, (int)pkt.power_w, energy);

    // LCD
    {
        char _r0[17], _r1[17];
        snprintf(_r0, sizeof(_r0), "%.0fV %.1fA %dW", v_l1, i_l1, (int)pkt.power_w);
        snprintf(_r1, sizeof(_r1), "R:%d N:%d B:%d", rssi, gw_node_count, gw_buf_count);
        gw_lcd_show(0, _r0);
        gw_lcd_show(1, _r1);
    }

    // JSON tayyorlash (elektr: ~450 bayt serializatsiya, 640 xavfsiz)
    // server_ok tekshirilmaydi — bufer store-and-forward vazifasini bajaradi
    StaticJsonDocument<640> doc;
    doc["device_id"]    = node->device_id;
    char _rid[32];
    snprintf(_rid, sizeof(_rid), "%s-%lu", node->device_id, (unsigned long)pkt.seq);
    doc["reading_id"]   = _rid;  // backend duplikatlarni shu orqali tashlaydi
    doc["utility_type"] = "electricity";
    doc["sensor_type"]  = is_te73 ? "te73" : "te71";
    doc["meter_serial"] = pkt.meter_serial;
    doc["fw_version"]   = FW_VERSION;
    doc["lora_rssi"]    = rssi;
    if (pkt.flags & 0x02) doc["is_test_device"] = true;  // elektr: bit1=test_mode

    if (pkt.v_l1 != 0) doc["voltage_l1"] = serialized(String(v_l1, 2));
    if (pkt.i_l1 != 0) doc["current_l1"] = serialized(String(i_l1, 3));
    if (is_te73) {
        if (pkt.v_l2 != 0) doc["voltage_l2"] = serialized(String(v_l2, 2));
        if (pkt.v_l3 != 0) doc["voltage_l3"] = serialized(String(v_l3, 2));
        if (pkt.i_l2 != 0) doc["current_l2"] = serialized(String(i_l2, 3));
        if (pkt.i_l3 != 0) doc["current_l3"] = serialized(String(i_l3, 3));
    }
    if (pkt.power_w  != 0) doc["power_w"]    = (int)pkt.power_w;
    if (pkt.freq_chz != 0) doc["frequency"]  = serialized(String(freq, 2));
    if (pkt.energy_wh!= 0) doc["energy_kwh"] = serialized(String(energy, 3));
    if (pkt.pf_pct   != 0) doc["pf"]         = serialized(String(pf, 3));

    char _ts[25];
    if (diag_timestamp(_ts, sizeof(_ts))) doc["timestamp"] = _ts;

    String body; serializeJson(doc, body);

    // Buferga push (HTTP keyinroq yuboriladi)
    bool needs_reg = !node->registered;
    bool ok = gw_buf_push(body, needs_reg, pkt.mac, &pkt, 0);
    if (ok) LOG_PRINTF("GW: buferga yozildi (%d/%d)\n", gw_buf_count, GW_BUF_SIZE);
    return ok;
}

// ─── Tuproq uplink qabul → buferga yozish ────────────────────────────────────
static bool gw_handle_soil_uplink(const LoRaSoilUplink& pkt, int rssi) {
    NodeState* node = gw_get_node(pkt.mac);
    if (!node) return false;
    node->last_seen = millis();

    float humidity = pkt.humidity / 100.0f;
    LOG_PRINTF("GW RX <- [%s] RSSI=%ddBm namlik=%.1f%%\n",
               node->device_id, rssi, humidity);

#ifndef LCD_SHOW_ELECTRICITY_ONLY
    // LCD
    {
        char _r0[17], _r1[17];
        snprintf(_r0, sizeof(_r0), "SOIL: %5.1f %%", humidity);
        snprintf(_r1, sizeof(_r1), "R:%d N:%d B:%d", rssi, gw_node_count, gw_buf_count);
        gw_lcd_show(0, _r0);
        gw_lcd_show(1, _r1);
    }
#endif

    StaticJsonDocument<256> doc;
    doc["device_id"]    = node->device_id;
    char _rid[32];
    snprintf(_rid, sizeof(_rid), "%s-%lu", node->device_id, (unsigned long)pkt.seq);
    doc["reading_id"]   = _rid;
    doc["utility_type"] = "soil";
    doc["sensor_type"]  = "capacitive_soil_moisture";
    doc["fw_version"]   = FW_VERSION;
    doc["lora_rssi"]    = rssi;
    if (pkt.flags & 0x01) doc["is_test_device"] = true;  // bit0=test_mode
    doc["humidity"]     = serialized(String(humidity, 1));

    char _ts[25];
    if (diag_timestamp(_ts, sizeof(_ts))) doc["timestamp"] = _ts;

    String body; serializeJson(doc, body);

    bool ok = gw_buf_push(body, !node->registered, pkt.mac, nullptr, 1);
    if (ok) LOG_PRINTF("GW: soil buferga yozildi (%d/%d)\n", gw_buf_count, GW_BUF_SIZE);
    return ok;
}

// ─── Ovoz uplink qabul → buferga yozish ──────────────────────────────────────
static bool gw_handle_sound_uplink(const LoRaSoundUplink& pkt, int rssi) {
    NodeState* node = gw_get_node(pkt.mac);
    if (!node) return false;
    node->last_seen = millis();

    float level = pkt.level / 100.0f;
    LOG_PRINTF("GW RX <- [%s] RSSI=%ddBm ovoz=%.1f%%\n",
               node->device_id, rssi, level);

#ifndef LCD_SHOW_ELECTRICITY_ONLY
    // LCD
    {
        char _r0[17], _r1[17];
        snprintf(_r0, sizeof(_r0), "SOUND: %5.1f %%", level);
        snprintf(_r1, sizeof(_r1), "R:%d N:%d B:%d", rssi, gw_node_count, gw_buf_count);
        gw_lcd_show(0, _r0);
        gw_lcd_show(1, _r1);
    }
#endif

    StaticJsonDocument<256> doc;
    doc["device_id"]    = node->device_id;
    char _rid[32];
    snprintf(_rid, sizeof(_rid), "%s-%lu", node->device_id, (unsigned long)pkt.seq);
    doc["reading_id"]   = _rid;
    doc["utility_type"] = "sound";
    doc["sensor_type"]  = "microphone";
    doc["fw_version"]   = FW_VERSION;
    doc["lora_rssi"]    = rssi;
    if (pkt.flags & 0x01) doc["is_test_device"] = true;  // bit0=test_mode
    if (pkt.level != 0) doc["level"] = serialized(String(level, 1));

    char _ts[25];
    if (diag_timestamp(_ts, sizeof(_ts))) doc["timestamp"] = _ts;

    String body; serializeJson(doc, body);
    bool ok = gw_buf_push(body, !node->registered, pkt.mac, nullptr, 2);
    if (ok) LOG_PRINTF("GW: sound buferga yozildi (%d/%d)\n", gw_buf_count, GW_BUF_SIZE);
    return ok;
}

// ─── Suv uplink qabul → buferga yozish ───────────────────────────────────────
static bool gw_handle_water_uplink(const LoRaWaterUplink& pkt, int rssi) {
    NodeState* node = gw_get_node(pkt.mac);
    if (!node) return false;
    node->last_seen = millis();

    float p_bottom = pkt.p_bottom / 1000.0f;
    float p_top    = pkt.p_top    / 1000.0f;
    float flow     = pkt.flow     / 100.0f;
    float volume   = pkt.volume   / 1000.0f;
    float temp     = pkt.temp     / 100.0f;

    LOG_PRINTF("GW RX <- [%s] RSSI=%ddBm suv p=%.3f/%.3f oqim=%.1f hajm=%.3f\n",
               node->device_id, rssi, p_bottom, p_top, flow, volume);

#ifndef LCD_SHOW_ELECTRICITY_ONLY
    // LCD
    {
        char _r0[17], _r1[17];
        snprintf(_r0, sizeof(_r0), "WATER: %.2f bar", p_bottom);
        snprintf(_r1, sizeof(_r1), "R:%d N:%d B:%d", rssi, gw_node_count, gw_buf_count);
        gw_lcd_show(0, _r0);
        gw_lcd_show(1, _r1);
    }
#endif

    StaticJsonDocument<384> doc;
    doc["device_id"]    = node->device_id;
    char _rid[32];
    snprintf(_rid, sizeof(_rid), "%s-%lu", node->device_id, (unsigned long)pkt.seq);
    doc["reading_id"]   = _rid;
    doc["utility_type"] = "water";
    doc["sensor_type"]  = "ads1115_hy131";
    doc["fw_version"]   = FW_VERSION;
    doc["lora_rssi"]    = rssi;
    if (pkt.flags & 0x01) doc["is_test_device"] = true;  // bit0=test_mode

    // Bosim har doim yuboriladi (0 ham xato/signal yo'q holatini bildiradi —
    // yashirilsa backend NULL saqlaydi va frontendda "—" chiqadi, farqlanmaydi)
    doc["pressure_bottom_bar"] = serialized(String(p_bottom, 3));
    doc["pressure_top_bar"]    = serialized(String(p_top, 3));
    if (pkt.flow     != 0) doc["flow_rate"]           = serialized(String(flow, 3));
    if (pkt.volume   != 0) doc["volume_m3"]           = serialized(String(volume, 3));
    if (pkt.temp     != 0) doc["temperature_c"]       = serialized(String(temp, 1));

    char _ts[25];
    if (diag_timestamp(_ts, sizeof(_ts))) doc["timestamp"] = _ts;

    String body; serializeJson(doc, body);
    bool ok = gw_buf_push(body, !node->registered, pkt.mac, nullptr, 3);
    if (ok) LOG_PRINTF("GW: water buferga yozildi (%d/%d)\n", gw_buf_count, GW_BUF_SIZE);
    return ok;
}

// ─── Gaz uplink qabul → buferga yozish ───────────────────────────────────────
static bool gw_handle_gas_uplink(const LoRaGasUplink& pkt, int rssi) {
    NodeState* node = gw_get_node(pkt.mac);
    if (!node) return false;
    node->last_seen = millis();

    float pressure = pkt.pressure / 1000.0f;
    float flow     = pkt.flow     / 1000.0f;
    float volume   = pkt.volume   / 1000.0f;
    float temp     = pkt.temp     / 100.0f;

    LOG_PRINTF("GW RX <- [%s] RSSI=%ddBm gaz p=%.3f oqim=%.3f hajm=%.3f\n",
               node->device_id, rssi, pressure, flow, volume);

#ifndef LCD_SHOW_ELECTRICITY_ONLY
    // LCD
    {
        char _r0[17], _r1[17];
        snprintf(_r0, sizeof(_r0), "GAS: %.3f m3", volume);
        snprintf(_r1, sizeof(_r1), "R:%d N:%d B:%d", rssi, gw_node_count, gw_buf_count);
        gw_lcd_show(0, _r0);
        gw_lcd_show(1, _r1);
    }
#endif

    StaticJsonDocument<384> doc;
    doc["device_id"]    = node->device_id;
    char _rid[32];
    snprintf(_rid, sizeof(_rid), "%s-%lu", node->device_id, (unsigned long)pkt.seq);
    doc["reading_id"]   = _rid;
    doc["utility_type"] = "gas";
    doc["sensor_type"]  = "gas_pulse_flow";
    doc["fw_version"]   = FW_VERSION;
    doc["lora_rssi"]    = rssi;
    if (pkt.flags & 0x01) doc["is_test_device"] = true;  // bit0=test_mode

    if (pkt.pressure != 0) doc["pressure_bar"]  = serialized(String(pressure, 3));
    if (pkt.flow     != 0) doc["flow_rate"]     = serialized(String(flow, 3));
    if (pkt.volume   != 0) doc["volume_m3"]     = serialized(String(volume, 3));
    if (pkt.temp     != 0) doc["temperature_c"] = serialized(String(temp, 1));

    char _ts[25];
    if (diag_timestamp(_ts, sizeof(_ts))) doc["timestamp"] = _ts;

    String body; serializeJson(doc, body);
    bool ok = gw_buf_push(body, !node->registered, pkt.mac, nullptr, 4);
    if (ok) LOG_PRINTF("GW: gas buferga yozildi (%d/%d)\n", gw_buf_count, GW_BUF_SIZE);
    return ok;
}

// ─── Backend command poll (node nomidan) ─────────────────────────────────────
static void gw_poll_commands() {
    for (int i = 0; i < gw_node_count; i++) {
        wdt_feed();  // 8 node × 5s GET = 40s — TWDT (30s) dan oshadi
        NodeState* n = &gw_nodes[i];
        char path[80];
        snprintf(path, sizeof(path), "/api/commands/%s", n->device_id);
        String resp = http_get(path);
        if (resp.isEmpty()) continue;

        StaticJsonDocument<1024> doc;
        if (deserializeJson(doc, resp)) continue;

        for (JsonObject cmd : doc["commands"].as<JsonArray>()) {
            int id = cmd["id"];
            const char* action = cmd["action"];
            if (!action) continue;

            char ack[80];
            snprintf(ack, sizeof(ack), "/api/commands/%d/ack", id);

            if (strcmp(action, "reboot") == 0) {
                http_post(ack, "{}");
                ESP.restart();
            } else {
                http_post(ack, "{}");
                LOG_PRINTF("GW: noma'lum cmd '%s'\n", action);
            }
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════════
void setup() {
#if CORE_DEBUG_LEVEL > 0 || defined(APP_DEBUG)
    Serial.begin(115200);
    { unsigned long _t = millis(); while (millis() - _t < 200) yield(); }
#endif

    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(gw_id, sizeof(gw_id), "%02X%02X%02X%02X%02X%02X",
             mac[0],mac[1],mac[2],mac[3],mac[4],mac[5]);
    mesh_init(mac);  // seq hisoblagich + dedup jadvali

    LOG_PRINTLN();
    LOG_PRINTLN("╔══════════════════════════════════════════╗");
    LOG_PRINTLN("║  Meter Monitor v" FW_VERSION " — LoRa GATEWAY  ║");
    LOG_PRINTLN("║  WiFi + LoRa 433MHz                      ║");
    LOG_PRINTLN("╚══════════════════════════════════════════╝");
    LOG_PRINTF("Gateway ID: %s\n", gw_id);

    gw_lcd_init();
    gw_lcd_show(0, "LoRa Gateway");
    gw_lcd_show(1, "Yuklanmoqda...");

    cfg_load();
    LOG_PRINTF("Server: %s\n", g_cfg.server_url);

    // BOOT tugmasi (GPIO0) 3s → WiFi reset
    pinMode(0, INPUT_PULLUP);
    if (digitalRead(0) == LOW) {
        unsigned long _bt = millis();
        while (millis() - _bt < 3000 && digitalRead(0) == LOW) yield();
        if (digitalRead(0) == LOW) {
            WiFiManager wm; wm.resetSettings(); ESP.restart();
        }
    }

    // WiFi ulanish — portal FAQAT sozlanmagan gatewayda ochiladi.
    // Router o'chiq bo'lsa ≤16s da davom etadi: LoRa qabul (mesh) WiFi siz ham
    // ishlashi shart — readinglar buferda to'planib, server qaytganda ketadi.
#ifndef DEFAULT_WIFI_SSID
  #define DEFAULT_WIFI_SSID ""
#endif
#ifndef DEFAULT_WIFI_PASS
  #define DEFAULT_WIFI_PASS ""
#endif
#ifndef WIFI_AP_NAME
  #define WIFI_AP_NAME   "Bakhromdev"
#endif
#ifndef WIFI_AP_PASS
  #define WIFI_AP_PASS   "998935580311"
#endif
    {
        bool wifi_ok = wifi_connect_boot(DEFAULT_WIFI_SSID, DEFAULT_WIFI_PASS);
        if (!wifi_ok) {
            gw_lcd_show(0, "WiFi AP Portal");
            gw_lcd_show(1, WIFI_AP_NAME);
            wifi_portal(WIFI_AP_NAME, WIFI_AP_PASS, gw_id, "LoRa Gateway");
        }
    }

    // Server (OTA gateway'da o'chirilgan)
    gw_server_ok = server_check();
    if (gw_server_ok) {
        gw_registered = true;
    }

    // LoRa init
    LOG_PRINT("LoRa SX1278 init...");
    if (!lora_init()) {
        LOG_PRINTLN(" XATO! Modul topilmadi.");
        gw_lcd_show(0, "LoRa Xatolik!");
        gw_lcd_show(1, "SX1278 Topilmadi");
        while (true) yield();
    }
    LoRa.receive();  // RX rejimida kutish
    LOG_PRINTF(" OK (433MHz, SF%d, BW%.0fkHz)\n", LORA_SF, LORA_BW / 1000.0);

    // LCD: tayyor holat
    {
        char _r0[17], _r1[17];
        snprintf(_r0, sizeof(_r0), "GW %s", gw_id + 8);  // oxirgi 4 char
        snprintf(_r1, sizeof(_r1), "W:%s S:%s L:OK",
                 WiFi.status()==WL_CONNECTED ? "OK" : "--",
                 gw_server_ok ? "OK" : "--");
        gw_lcd_show(0, _r0);
        gw_lcd_show(1, _r1);
    }

    LOG_PRINTLN();
    LOG_PRINTLN("┌──────────────────────────────────────────┐");
    LOG_PRINTF( "│  Gateway ID : %-26s│\n", gw_id);
    LOG_PRINTF( "│  Server     : %-26s│\n", g_cfg.server_url);
    LOG_PRINTF( "│  Max nodes  : %-26d│\n", GW_MAX_NODES);
    LOG_PRINTLN("└──────────────────────────────────────────┘");
    // NTP + Watchdog (OTA gateway'da o'chirilgan)
    ntp_init();
    wdt_init();
    LOG_PRINTLN("Tinglayapman...\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loop
// ═══════════════════════════════════════════════════════════════════════════════
void loop() {
    wdt_feed();
    unsigned long now = millis();

    // ── LoRa paket tekshirish (interrupt-less polling) ────────────────────────
    int pkt_size = LoRa.parsePacket();
    if (pkt_size > 0) {
        int rssi = LoRa.packetRssi();

        uint8_t rxbuf[64];
        if (pkt_size < (int)(LORA_HDR_LEN + 2) || pkt_size > (int)sizeof(rxbuf)) {
            while (LoRa.available()) LoRa.read();
            LOG_PRINTF("GW: yaroqsiz paket hajmi (%d)\n", pkt_size);
        } else {
            LoRa.readBytes(rxbuf, pkt_size);
            uint8_t ptype = rxbuf[0];

            // ── ACK (node → gateway; boshqa GW uchun bo'lsa mesh orqali o'tadi) ──
            if (ptype == PKT_ACK && pkt_size == (int)sizeof(LoRaAck)) {
                if (!mesh_dedup_seen(rxbuf, pkt_size)) {
                    LoRaAck ack; memcpy(&ack, rxbuf, sizeof(ack));
                    uint8_t raw[sizeof(LoRaAck)]; memcpy(raw, rxbuf, sizeof(raw));
                    if (lora_decrypt_pkt((uint8_t*)&ack, sizeof(ack))) {
                        mesh_dedup_record(raw, sizeof(raw));
                        // Boshqa gateway ACKi — mesh davom etsin (nodega yetsin)
                        mesh_relay(raw, sizeof(raw));
                    }
                }
            }
            // ── Takror uplink — avval qabul qilingan, node ACKni olmagan ────────
            else if (mesh_dedup_seen(rxbuf, pkt_size)) {
                if (ptype == PKT_UPLINK || (ptype >= PKT_UPLINK_SOIL && ptype <= PKT_UPLINK_GAS)) {
                    LOG_PRINTLN("GW: takror uplink — ACK qayta yuborildi");
                    mesh_send_ack(rxbuf + 1, lora_hdr_seq(rxbuf), ptype);
                }
            }
            // ── Yangi paket ─────────────────────────────────────────────────────
            else {
                // Deshifrlangan nusxa bilan ishlaymiz; rxbuf (shifrlangan)
                // relay uchun o'z holicha qoladi
                uint8_t dec[64]; memcpy(dec, rxbuf, pkt_size);
                if (!lora_decrypt_pkt(dec, pkt_size)) {
                    LOG_PRINTLN("GW: deshifrlash/CRC xato");
                } else {
                    bool accepted = false;
                    bool known    = true;
                    if (pkt_size == (int)sizeof(LoRaUplink) && ptype == PKT_UPLINK) {
                        accepted = gw_handle_uplink(*(const LoRaUplink*)dec, rssi);
                    } else if (pkt_size == (int)sizeof(LoRaWaterUplink) && ptype == PKT_UPLINK_WATER) {
                        accepted = gw_handle_water_uplink(*(const LoRaWaterUplink*)dec, rssi);
                    } else if (pkt_size == (int)sizeof(LoRaGasUplink) && ptype == PKT_UPLINK_GAS) {
                        accepted = gw_handle_gas_uplink(*(const LoRaGasUplink*)dec, rssi);
                    } else if (pkt_size == (int)sizeof(LoRaSoilUplink) && ptype == PKT_UPLINK_SOIL) {
                        accepted = gw_handle_soil_uplink(*(const LoRaSoilUplink*)dec, rssi);
                    } else if (pkt_size == (int)sizeof(LoRaSoundUplink) && ptype == PKT_UPLINK_SOUND) {
                        accepted = gw_handle_sound_uplink(*(const LoRaSoundUplink*)dec, rssi);
                    } else if (ptype == PKT_UPLINK && pkt_size == (int)sizeof(LoRaUplinkV1)) {
                        // Eski (v1, 46-bayt) elektr paket — tarjima qilib qabul
                        LOG_PRINTLN("GW: eski v1 elektr paket (46-bayt) — moslashuv rejimi");
                        LoRaUplink _conv = gw_upconvert_v1(*(const LoRaUplinkV1*)dec);
                        accepted = gw_handle_uplink(_conv, rssi);
                    } else {
                        known = false;
                        LOG_PRINTF("GW: noma'lum paket (hajm=%d, type=0x%02X)\n",
                                   pkt_size, ptype);
                    }

                    if (accepted) {
                        // Qabul qilindi: dedup + ACK
                        mesh_dedup_record(rxbuf, pkt_size);
                        mesh_send_ack(rxbuf + 1, lora_hdr_seq(rxbuf), ptype);
                    } else if (known) {
                        // Qabul qilolmadik (bufer to'la / node limiti) —
                        // boshqa gateway eshitishi uchun relay qilamiz.
                        // Dedup YOZILMAYDI: node retry sini keyin qabul qila olamiz.
                        mesh_relay(rxbuf, pkt_size);
                    }
                }
            }
        }
        LoRa.receive();
    }

    // ── Bufer flush (har 3s — LoRa RX ni bloklamasdan) ──────────────────────
    if (gw_buf_count > 0 && gw_server_ok && WiFi.status() == WL_CONNECTED &&
        now - gw_last_flush_ms >= GW_BUF_FLUSH_MS) {
        gw_last_flush_ms = now;
        gw_buf_flush();
        LoRa.receive();  // HTTP dan keyin RX rejimiga qaytish
    }

    // ── Server health check (har 60s) ─────────────────────────────────────────
    if (now - gw_last_hlth_ms >= GW_HEALTH_MS) {
        gw_last_hlth_ms = now;
        bool prev = gw_server_ok;
        gw_server_ok = server_check();
        if (gw_server_ok && !prev) {
            LOG_PRINTLN("GW: server qaytdi!");
            if (!gw_registered) {
                gw_registered = true;
            }
        }
    }

    // ── Command poll + status (har 30s) ──────────────────────────────────────
    if (gw_server_ok && WiFi.status() == WL_CONNECTED &&
        now - gw_last_cmd_ms >= GW_CMD_POLL_MS) {
        gw_last_cmd_ms = now;
        gw_poll_commands();
    }

    if (gw_server_ok && WiFi.status() == WL_CONNECTED &&
        now - gw_last_stat_ms >= GW_STATUS_MS) {
        gw_last_stat_ms = now;
        // firmware_mode=lora_gateway bilan yuborish (electricity ESP32 uchun L: indikatori)
        StaticJsonDocument<256> _sd;
        _sd["device_id"]        = gw_id;
        _sd["utility_type"]     = "gateway";
        _sd["software_version"] = FW_VERSION;
        _sd["rssi"]             = WiFi.RSSI();
        _sd["online"]           = true;
        _sd["firmware_mode"]    = "lora_gateway";
        String _sb; serializeJson(_sd, _sb);
        http_post("/api/device-status", _sb);
    }
}
