#pragma once
/**
 * soil.h — Yerto'la namligi sensori (kapasitiv ADC)
 *
 * Barcha parametrlar platformio.ini [build_flags] orqali o'zgartiriladi:
 *
 *   -DPIN_SOIL_ADC=32      → Sensor AOUT ulangan GPIO (default: 34)
 *   -DSOIL_ADC_DRY=3300    → Havoda o'lchangan quruq qiymat (default: 3300)
 *   -DSOIL_ADC_WET=1400    → Suvda o'lchangan nam qiymat (default: 1400)
 *
 * Ulanish:
 *   Sensor VCC  → 3.3V
 *   Sensor GND  → GND
 *   Sensor AOUT → GPIO[PIN_SOIL_ADC]
 *
 * Display: disp_soil.h (main.cpp tomonidan yuklanadi — sensor bu haqda bilmaydi)
 */

#include <Arduino.h>
#include <ArduinoJson.h>

// ─── ADC pin va kalibrovka (platformio.ini dan override qilish mumkin) ────────
#ifndef PIN_SOIL_ADC
  #define PIN_SOIL_ADC    34      // GPIO34 = ADC1_CH6
#endif
#ifndef SOIL_ADC_DRY
  #define SOIL_ADC_DRY  3300     // Havoda o'lchab belgilang
#endif
#ifndef SOIL_ADC_WET
  #define SOIL_ADC_WET  1400     // Suvda o'lchab belgilang
#endif
#define SOIL_ADC_SAMPLES  16    // Shovqin uchun o'rtacha

// ─── MQ135 havo sifati sensori (ixtiyoriy, -DHAVE_MQ135) ─────────────────────
// Analog AOUT → GPIO[PIN_MQ135]. Yuqori qiymat = havo ifloslangan (gaz/tutun).
#ifdef HAVE_MQ135
  #ifndef PIN_MQ135
    #define PIN_MQ135  35        // GPIO35 = ADC1_CH7
  #endif
  #define MQ135_SAMPLES  16
#endif

// ─── SensorData ───────────────────────────────────────────────────────────────
struct SensorData {
    float humidity;  // 0.0 – 100.0 %
#ifdef HAVE_MQ135
    int   air_raw;   // MQ135 xom ADC (0–4095)
    float air_v;     // MQ135 kuchlanishi (V)
    float air_pct;   // Nisbiy havo ifloslanishi % (yuqori = yomonroq)
#endif
    bool  valid;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Sensor API  (main.cpp dan chaqiriladi)
// ═══════════════════════════════════════════════════════════════════════════════

static void sensor_init() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    pinMode(PIN_SOIL_ADC, INPUT);

    // Isitish (warming-up) o'qishlari
    for (int i = 0; i < 5; i++) { analogRead(PIN_SOIL_ADC); }

    LOG_PRINTF("Tuproq namligi sensori tayyor (GPIO%d)\n", PIN_SOIL_ADC);
    LOG_PRINTF("  Kalibrovka: quruq=%d, nam=%d\n", SOIL_ADC_DRY, SOIL_ADC_WET);

#ifdef HAVE_MQ135
    pinMode(PIN_MQ135, INPUT);
    for (int i = 0; i < 5; i++) { analogRead(PIN_MQ135); }
    LOG_PRINTF("MQ135 havo sifati sensori tayyor (GPIO%d)\n", PIN_MQ135);
#endif
}

static bool sensor_connect() { return true; }

static bool sensor_read(SensorData& d) {
    if (g_cfg.test_mode) {
        static float sim = 55.0f;
        sim += (random(-10, 11)) * 0.5f;
        sim = constrain(sim, 10.0f, 90.0f);
        d.humidity = sim;
        d.valid    = true;
#ifdef HAVE_MQ135
        d.air_raw = 1200; d.air_v = 0.97f; d.air_pct = 29.0f;
#endif
        LOG_PRINTF("[TEST] Namlik: %.1f%%\n", d.humidity);
        return true;
    }

    long sum = 0;
    for (int i = 0; i < SOIL_ADC_SAMPLES; i++) {
        sum += analogRead(PIN_SOIL_ADC);
        delayMicroseconds(500);
    }
    int raw = (int)(sum / SOIL_ADC_SAMPLES);

    float pct = (float)(SOIL_ADC_DRY - raw) / (float)(SOIL_ADC_DRY - SOIL_ADC_WET) * 100.0f;
    pct = constrain(pct, 0.0f, 100.0f);

    d.humidity = pct;
    d.valid    = true;
    LOG_PRINTF("Tuproq: raw=%d → %.1f%%  (quruq=%d, nam=%d)\n",
               raw, pct, SOIL_ADC_DRY, SOIL_ADC_WET);

#ifdef HAVE_MQ135
    long asum = 0;
    for (int i = 0; i < MQ135_SAMPLES; i++) {
        asum += analogRead(PIN_MQ135);
        delayMicroseconds(500);
    }
    d.air_raw = (int)(asum / MQ135_SAMPLES);
    d.air_v   = d.air_raw * 3.3f / 4095.0f;
    d.air_pct = constrain(d.air_raw / 4095.0f * 100.0f, 0.0f, 100.0f);  // nisbiy (yuqori=yomonroq)
    LOG_PRINTF("MQ135: raw=%d  %.2fV  havo=%.0f%% (yuqori=yomonroq)\n",
               d.air_raw, d.air_v, d.air_pct);
#endif
    return true;
}

void sensor_set_volume(float) {}  // stub (common.h extern talab qiladi)

// WiFi rejimida ishlatiladi
#ifndef SOIL_DEVICE_ROLE
  #define SOIL_DEVICE_ROLE "soil_outdoor"
#endif

#ifndef RS485_LEAF
// app_register() WiFi/core-api.h talab qiladi — RS-485 leaf'da yo'q, faqat
// oddiy WiFi rejimida kerak.
static bool sensor_do_register(const char* device_id, const char* fw_version) {
    return app_register(device_id, "soil", "capacitive_soil_moisture", "", fw_version, 0, SOIL_DEVICE_ROLE);
}
#endif

// JSON qurish — oddiy WiFi va RS485_LEAF rejimida ham kerak.
static String sensor_build_json(const char* device_id,
                                 const char* fw_ver,
                                 const SensorData& d) {
    StaticJsonDocument<256> doc;
    doc["device_id"]    = device_id;
    doc["utility_type"] = "soil";
    doc["sensor_type"]  = "capacitive_soil_moisture";
    doc["device_role"]  = SOIL_DEVICE_ROLE;
    doc["fw_version"]   = fw_ver;
    if (g_cfg.test_mode) doc["is_test_device"] = true;
    if (d.valid) doc["humidity"] = serialized(String(d.humidity, 1));
#ifdef HAVE_MQ135
    if (d.valid) {
        doc["air_raw"] = d.air_raw;
        doc["air_pct"] = serialized(String(d.air_pct, 0));
    }
#endif
    String out;
    serializeJson(doc, out);
    return out;
}
