#pragma once
/**
 * heating.h — Qozonxona kirish/chiqish suv harorati (2x DS18B20) — iot_v2 (RS-485 / WiFi)
 *
 * Apparat:
 *   DS18B20 #1 (kirish, "supply") → GPIO PIN_TEMP_IN  (1-Wire, har biri
 *   DS18B20 #2 (chiqish, "return") → GPIO PIN_TEMP_OUT   o'z alohida shinasida)
 *   Har ikkalasi ham 1-Wire — 4.7kΩ pull-up rezistor DATA-VCC oralig'ida kerak.
 *
 * Parametrlar (platformio.ini):
 *   -DPIN_TEMP_IN=4    → Kirish (supply) DS18B20 GPIO (standart: 4)
 *   -DPIN_TEMP_OUT=5   → Chiqish (return) DS18B20 GPIO (standart: 5)
 *
 * Sensor API (main.cpp dan chaqiriladi):
 *   sensor_init()              — ikkala OneWire shinasini sozlaydi
 *   sensor_connect() → bool   — kamida bitta DS18B20 topildimi
 *   sensor_read(SensorData&)  → bool — ikkala haroratni o'qiydi
 *   sensor_build_json(...)    → String — JSON (WiFi va RS485_LEAF uchun)
 *   sensor_do_register(...)   → bool — backend register (faqat WiFi uchun)
 */

#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

#ifndef PIN_TEMP_IN
  #define PIN_TEMP_IN   4
#endif
#ifndef PIN_TEMP_OUT
  #define PIN_TEMP_OUT  5
#endif

static OneWire g_ow_in(PIN_TEMP_IN);
static OneWire g_ow_out(PIN_TEMP_OUT);
static DallasTemperature g_ds_in(&g_ow_in);
static DallasTemperature g_ds_out(&g_ow_out);
static bool g_ds_in_ok  = false;
static bool g_ds_out_ok = false;

struct SensorData {
    float temperature_in_c;    // Kirish (supply) harorati, C — topilmasa NAN
    float temperature_out_c;   // Chiqish (return) harorati, C — topilmasa NAN
    bool  valid;
};

static void sensor_init() {
    g_ds_in.begin();
    g_ds_out.begin();
    g_ds_in_ok  = g_ds_in.getDeviceCount()  > 0;
    g_ds_out_ok = g_ds_out.getDeviceCount() > 0;

    LOG_PRINTF("Isitish sensor: kirish(GPIO%d)=%s chiqish(GPIO%d)=%s\n",
               PIN_TEMP_IN,  g_ds_in_ok  ? "topildi" : "YO'Q",
               PIN_TEMP_OUT, g_ds_out_ok ? "topildi" : "YO'Q");
}

static bool sensor_connect() {
    return g_ds_in_ok || g_ds_out_ok;
}

static bool sensor_read(SensorData& d) {
    if (g_cfg.test_mode) {
        d.temperature_in_c  = 68.0f + (random(-50, 51) / 10.0f);
        d.temperature_out_c = 42.0f + (random(-50, 51) / 10.0f);
        d.valid = true;
        LOG_PRINTF("[TEST] Isitish: kirish=%.1fC chiqish=%.1fC\n",
                   d.temperature_in_c, d.temperature_out_c);
        return true;
    }

    if (!g_ds_in_ok && !g_ds_out_ok) { d.valid = false; return false; }

    d.temperature_in_c  = NAN;
    d.temperature_out_c = NAN;

    if (g_ds_in_ok) {
        g_ds_in.requestTemperatures();
        float t = g_ds_in.getTempCByIndex(0);
        if (t != DEVICE_DISCONNECTED_C) d.temperature_in_c = t;
    }
    if (g_ds_out_ok) {
        g_ds_out.requestTemperatures();
        float t = g_ds_out.getTempCByIndex(0);
        if (t != DEVICE_DISCONNECTED_C) d.temperature_out_c = t;
    }

    d.valid = true;
    LOG_PRINTF("Isitish: kirish=%.1fC chiqish=%.1fC\n",
               d.temperature_in_c, d.temperature_out_c);
    return true;
}

void sensor_set_volume(float) {}  // stub (common.h extern talab qiladi)

#ifndef RS485_LEAF
// app_register() WiFi/core-api.h talab qiladi — RS-485 leaf'da yo'q, faqat
// oddiy WiFi rejimida kerak.
static bool sensor_do_register(const char* device_id, const char* fw_version) {
    return app_register(device_id, "heating", "ds18b20_x2", "", fw_version, 0, "heating_node");
}
#endif

// JSON qurish — oddiy WiFi va RS485_LEAF rejimida ham kerak.
static String sensor_build_json(const char* device_id,
                                 const char* fw_ver,
                                 const SensorData& d) {
    StaticJsonDocument<256> doc;
    doc["device_id"]    = device_id;
    doc["utility_type"] = "heating";
    doc["sensor_type"]  = "ds18b20_x2";
    doc["fw_version"]   = fw_ver;
    if (g_cfg.test_mode) doc["is_test_device"] = true;
    if (!isnan(d.temperature_in_c))  doc["temperature_in_c"]  = serialized(String(d.temperature_in_c, 1));
    if (!isnan(d.temperature_out_c)) doc["temperature_out_c"] = serialized(String(d.temperature_out_c, 1));
    String out;
    serializeJson(doc, out);
    return out;
}
