#pragma once
/**
 * rs485_leaf.h — Bino ichidagi RS-485 "leaf" sensor kontrolleri.
 *
 * "Ahmoq"/generik qurilma: WiFi/radio yo'q, qaysi binoda ekanini bilmaydi.
 * Vazifasi faqat: sensordan o'qi, bridge so'raganda RS-485 orqali JSON
 * javob ber. JSON format mavjud sensor_build_json() bilan BIR XIL (xuddi
 * oddiy WiFi rejimida ishlatiladigan) — bridge buni faqat timestamp qo'shib,
 * o'zgarishsiz /api/readings ga POST qiladi.
 *
 * Sensor o'qish mantig'i (sensors katalogidagi fayllar) o'zgarishsiz qayta
 * ishlatiladi.
 *
 * Build: pio run -e water_rs485_leaf / gas_rs485_leaf / soil_rs485_leaf / sound_rs485_leaf
 */

#include <Arduino.h>
#include <esp_system.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "core/log.h"
#include "core/watchdog.h"

// ─── Minimal config (WiFi yo'q, faqat sensors/*.h kutgan interfeys) ──────────
struct AppConfig { bool test_mode; };
static AppConfig g_cfg = { false };

// ─── Sensor tanlash ───────────────────────────────────────────────────────────
#if defined(SENSOR_SOIL)
  #include "sensors/soil.h"
  #define LEAF_SENSOR_NAME "Tuproq"
#elif defined(SENSOR_SOUND)
  #include "sensors/sound.h"
  #define LEAF_SENSOR_NAME "Ovoz"
#elif defined(SENSOR_WATER)
  #include "sensors/water.h"
  #define LEAF_SENSOR_NAME "Suv"
#elif defined(SENSOR_GAS)
  #include "sensors/gas.h"
  #define LEAF_SENSOR_NAME "Gaz"
#elif defined(SENSOR_HEATING)
  #include "sensors/heating.h"
  #define LEAF_SENSOR_NAME "Isitish"
#elif defined(SENSOR_ELECTRICITY)
  // Tok leaf — "DLMS→JSON tarjimon": metrni Serial2 (16/17/4) da DLMS bilan
  // o'qiydi, natijani Serial1 (leaf shina) ga JSON qilib chiqaradi. 2 MAX485.
  #include "sensors/electricity.h"
  #define LEAF_SENSOR_NAME "Elektr"
  #define LEAF_NEEDS_CONNECT 1
#else
  #error "RS-485 leaf uchun sensor turi kerak: -DSENSOR_SOIL/_SOUND/_WATER/_GAS/_HEATING/_ELECTRICITY"
#endif

#include "rs485_bus.h"

// ─── Leaf holati ──────────────────────────────────────────────────────────────
static char leaf_id[20];

#ifdef LEAF_NEEDS_CONNECT
// Elektr metrni DLMS bilan o'qish SEKIN (bir necha OBIS, ~1-2s). Poll kelganda
// shu qadar kutib bo'lmaydi — master oynasi yopiladi. Shuning uchun metrni
// FONDA muntazam o'qib keshlab qo'yamiz, poll kelganda DARHOL keshdan javob
// beramiz. (Boshqa sensorlar tez o'qiladi — ularda kesh kerak emas.)
#ifndef METER_REFRESH_MS
  #define METER_REFRESH_MS 15000UL
#endif
static SensorData   g_cached_sd;
static bool         g_cache_ok = false;
static unsigned long g_last_meter_ms = 0;

static void leaf_refresh_meter() {
    if (g_cache_ok && (millis() - g_last_meter_ms < METER_REFRESH_MS)) return;
    if (!dlms_connected && !sensor_connect()) return;   // meter yo'q — keyin qayta urinadi
    SensorData sd;
    if (sensor_read(sd) && sd.valid) {
        g_cached_sd = sd;
        g_cache_ok = true;
        g_last_meter_ms = millis();
        LOG_PRINTF("Metr kesh yangilandi: V=%.1f P=%.0fW E=%.3f\n",
                   sd.voltage_l1, sd.power_w, sd.energy_kwh);
    } else {
        dlms_disconnect();   // keyingi safar qayta ulanish
    }
}
#endif

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
#if CORE_DEBUG_LEVEL > 0 || defined(APP_DEBUG)
    Serial.begin(115200);
    unsigned long _t = millis(); while (millis() - _t < 200) yield();
#endif
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(leaf_id, sizeof(leaf_id), "%02X%02X%02X%02X%02X%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    LOG_PRINTLN();
    LOG_PRINTLN("┌──────────────────────────────────────────┐");
    LOG_PRINTF( "│  RS-485 LEAF | %-27s│\n", LEAF_SENSOR_NAME);
    LOG_PRINTF( "│  ID: %-36s│\n", leaf_id);
    LOG_PRINTLN("└──────────────────────────────────────────┘");

    rs485_init();
    sensor_init();
#ifdef LEAF_NEEDS_CONNECT
    // Elektr metr DLMS handshake (Serial2). Ulanmasa ham davom etamiz —
    // loop() da har poll'da qayta urinamiz.
    if (sensor_connect()) LOG_PRINTLN("Metr DLMS ulanish OK");
    else                  LOG_PRINTLN("Metr DLMS ulanmadi — poll'da qayta urinadi");
#endif
    wdt_init();
    LOG_PRINTLN("Tayyor — bridge poll kutilmoqda.\n");
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
void loop() {
    wdt_feed();

#ifdef LEAF_NEEDS_CONNECT
    // Metrni fonda muntazam o'qib keshlaymiz (poll'dan mustaqil).
    leaf_refresh_meter();
#endif

    uint8_t buf[24];   // [0xF2] + ID (12 belgi) uchun zaxira bilan
    uint16_t n = rs485_recv_frame(buf, sizeof(buf), 200);
    if (n < 1) return;

    // DIAGNOSTIKA — shinadan biror narsa kelganini ko'rsatadi
    LOG_PRINT("RS485 RX <-");
    for (uint16_t _i = 0; _i < n; _i++) LOG_PRINTF(" %02X", buf[_i]);
    LOG_PRINTLN("");

    // Komanda turini aniqlaymiz.
    size_t id_len = strlen(leaf_id);
    bool is_discover = (buf[0] == RS485_CMD_DISCOVER && n == 1) ||
                       (buf[0] == RS485_POLL_BYTE && n == 1);       // eski broadcast
    bool is_for_me   = (buf[0] == RS485_CMD_POLL && n == 1 + id_len &&
                        memcmp(buf + 1, leaf_id, id_len) == 0);
    if (!is_discover && !is_for_me) return;   // menga tegishli emas — jim

    // DISCOVER — bir necha leaf birdan javob berishi mumkin, to'qnashmaslik
    // uchun katta jitter. Adresli POLL'da faqat bitta leaf javob beradi, lekin
    // master TX->RX ga o'tishga ulgurishi uchun kichik kafolatlangan pauza
    // (~25-50ms) kerak — juda tez javob bersa master o'tkazib yuboradi.
    unsigned long d = is_discover ? random(20, 200) : random(25, 50);
    unsigned long t = millis(); while (millis() - t < d) { wdt_feed(); yield(); }

#ifdef LEAF_NEEDS_CONNECT
    // Elektr: poll kelganda DARHOL keshdan javob (sekin DLMS o'qish fonda
    // bo'lgan). Hali bir marta ham o'qilmagan bo'lsa — jim (master offline
    // ko'rsatadi, keyingi kesh kelganda javob beradi).
    if (!g_cache_ok) {
        LOG_PRINTLN("Metr keshi hali bo'sh — bu poll'ga javob berilmadi");
        return;
    }
    SensorData sd = g_cached_sd;
#else
    SensorData sd;
    if (!sensor_read(sd) || !sd.valid) return;
#endif

    String json = sensor_build_json(leaf_id, FW_VERSION, sd);
    LOG_PRINTF("RS485 TX -> %s\n", json.c_str());
    rs485_send_frame((const uint8_t*)json.c_str(), (uint16_t)json.length());
}
