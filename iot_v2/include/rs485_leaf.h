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
#else
  #error "RS-485 leaf uchun sensor turi kerak: -DSENSOR_SOIL/_SOUND/_WATER/_GAS"
#endif

#include "rs485_bus.h"

// ─── Leaf holati ──────────────────────────────────────────────────────────────
static char leaf_id[20];

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
    wdt_init();
    LOG_PRINTLN("Tayyor — bridge poll kutilmoqda.\n");
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
void loop() {
    wdt_feed();

    uint8_t buf[4];
    uint16_t n = rs485_recv_frame(buf, sizeof(buf), 200);
    if (n != 1 || buf[0] != RS485_POLL_BYTE) return;

    // Bir nechta leaf bir vaqtda javob berib to'qnashmasligi uchun tasodifiy
    // kechikish.
    unsigned long d = random(20, 200);
    unsigned long t = millis(); while (millis() - t < d) { wdt_feed(); yield(); }

    SensorData sd;
    if (!sensor_read(sd) || !sd.valid) return;

    String json = sensor_build_json(leaf_id, FW_VERSION, sd);
    LOG_PRINTF("RS485 TX -> %s\n", json.c_str());
    rs485_send_frame((const uint8_t*)json.c_str(), (uint16_t)json.length());
}
