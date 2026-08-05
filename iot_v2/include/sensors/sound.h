#pragma once
/**
 * sound.h — Ovoz darajasi sensori (mikrofon ADC)
 *
 * Parametrlar (platformio.ini):
 *   -DPIN_SOUND_ADC=34      → Mikrofon AOUT GPIO
 *   -DSOUND_SAMPLES=64      → ADC namunalar soni
 *   -DSOUND_FIGHT_REF=2500  → 100% amplituda chegarasi
 */

#include <Arduino.h>
#include <ArduinoJson.h>

#ifndef PIN_SOUND_ADC
  #define PIN_SOUND_ADC   34
#endif
#ifndef SOUND_SAMPLES
  #define SOUND_SAMPLES   300
#endif
#ifndef SOUND_FIGHT_REF
  #define SOUND_FIGHT_REF 2500.0f
#endif

struct SensorData {
    float level;   // 0–100 %
    bool  valid;
};

// ─── Ichki holat ──────────────────────────────────────────────────────────────
static float s_noise_floor  = 0.0f;
static float s_level_smooth = 0.0f;

// ADC amplituda: 50ms audio sample oyna ichida peak-to-peak o'lchash
static int _sound_amplitude() {
    int lo = 4095, hi = 0;
    unsigned long start = millis();
    while (millis() - start < 50) {
        int v = analogRead(PIN_SOUND_ADC);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        delayMicroseconds(50);
    }
    if (hi < lo) return 0;
    return hi - lo;
}

// ═══════════════════════════════════════════════════════════════════════════════

static void sensor_init() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    pinMode(PIN_SOUND_ADC, INPUT);
    for (int i = 0; i < 10; i++) analogRead(PIN_SOUND_ADC);

    // Boshlang'ich noise floor — 10 ta o'qishning o'rtachasi
    long sum = 0;
    for (int i = 0; i < 10; i++) sum += _sound_amplitude();
    s_noise_floor = (float)sum / 10.0f;
    if (s_noise_floor < 10.0f) s_noise_floor = 10.0f;
    s_level_smooth = 0.0f;

    LOG_PRINTF("Ovoz sensori (GPIO%d) noise=%.0f\n", PIN_SOUND_ADC, s_noise_floor);
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

    // Avtomatik noise floor moslashuvi (asta-sekin)
    if ((float)amp < s_noise_floor * 1.5f) {
        s_noise_floor = s_noise_floor * 0.95f + (float)amp * 0.05f;
    }

    float real = max(0.0f, (float)amp - s_noise_floor);
    float target_level = constrain((real / SOUND_FIGHT_REF) * 100.0f, 0.0f, 100.0f);

    // EMA silliqlashtirish (sakramaydigan tekis harakat): o'sish 0.25, tushish 0.08
    float alpha = (target_level > s_level_smooth) ? 0.25f : 0.08f;
    s_level_smooth += (target_level - s_level_smooth) * alpha;

    if (s_level_smooth < 0.5f) s_level_smooth = 0.0f;

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
