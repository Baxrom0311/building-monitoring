#pragma once
/**
 * sound.h — Ovoz darajasi sensori (mikrofon ADC)
 *
 * GPIO 34 (ADC1_CH6) — ESP32 analog kiritish pini
 */

#include <Arduino.h>
#include <ArduinoJson.h>

#ifndef PIN_SOUND_ADC
  #define PIN_SOUND_ADC   34
#endif

struct SensorData {
    float level;   // 0–100 %
    bool  valid;
};

// ─── Ichki holat ──────────────────────────────────────────────────────────────
static float s_level_smooth = 7.5f; // Boshlang'ich holat ~7.5% (tinch xona)

// ADC amplituda: 80ms audio sample oyna ichida peak-to-peak o'lchash (hi - lo)
static int _sound_amplitude() {
    int lo = 4095, hi = 0;
    unsigned long start = millis();
    while (millis() - start < 80) {
        int v = analogRead(PIN_SOUND_ADC);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        delayMicroseconds(40);
    }
    if (hi <= lo) return 0;
    return hi - lo;
}

// ═══════════════════════════════════════════════════════════════════════════════

static void sensor_init() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    analogSetPinAttenuation(PIN_SOUND_ADC, ADC_11db);
    pinMode(PIN_SOUND_ADC, INPUT);

    for (int i = 0; i < 10; i++) analogRead(PIN_SOUND_ADC);
    s_level_smooth = 7.5f;
    LOG_PRINTF("Ovoz sensori tayyor (GPIO%d, ADC_11db 0-3.3V)\n", PIN_SOUND_ADC);
}

static bool sensor_connect() { return true; }

static bool sensor_read(SensorData& d) {
    if (g_cfg.test_mode) {
        static float sim = 25.0f;
        sim += random(-20, 21) * 0.5f;
        sim = constrain(sim, 0.0f, 95.0f);
        d = {sim, true};
        return true;
    }

    int amp = _sound_amplitude();

    // Mikrofon ADC peak-to-peak o'lchovi (0-4095)
    // Tinch xona baseline = ~20-50 ADC counts
    // Gapirish / muloqot = ~300-900 ADC counts
    // Baland shovqin / baqirish = 2400+ ADC counts
    
    float signal = max(0.0f, (float)amp - 40.0f);
    
    // Tinch xona norma = 7.0%
    // 2400 ADC P2P = 100% full scale
    float target_level = constrain(7.0f + (signal / 2400.0f) * 100.0f, 7.0f, 100.0f);

    // EMA silliqlashtirish: o'sish 0.40 (tez sezish), tushish 0.12
    float alpha = (target_level > s_level_smooth) ? 0.40f : 0.12f;
    s_level_smooth += (target_level - s_level_smooth) * alpha;

    if (s_level_smooth < 7.0f) s_level_smooth = 7.0f;

    LOG_PRINTF("Ovoz ADC GPIO%d: amp=%d signal=%.1f level=%.1f%%\n", PIN_SOUND_ADC, amp, signal, s_level_smooth);

    d = {s_level_smooth, true};
    return true;
}

void sensor_set_volume(float) {}

#ifndef RS485_LEAF
// app_register() WiFi/core-api.h talab qiladi — RS-485 leaf'da yo'q, faqat
// oddiy WiFi rejimida kerak.
static bool sensor_do_register(const char* device_id, const char* fw_version) {
    return app_register(device_id, "sound", "microphone", "", fw_version, 0);
}
#endif

// JSON qurish — oddiy WiFi va RS485_LEAF rejimida ham kerak.
static String sensor_build_json(const char* device_id,
                                 const char* fw_ver,
                                 const SensorData& d) {
    StaticJsonDocument<256> doc;
    doc["device_id"]    = device_id;
    doc["utility_type"] = "sound";
    doc["sensor_type"]  = "microphone";
    doc["fw_version"]   = fw_ver;
    if (g_cfg.test_mode) doc["is_test_device"] = true;
    if (d.valid) doc["level"] = serialized(String(d.level, 1));
    String out;
    serializeJson(doc, out);
    return out;
}
