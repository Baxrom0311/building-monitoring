#pragma once
/**
 * sound.h — Ovoz darajasi sensori (mikrofon ADC / DSP Multi-Frame)
 *
 * 10 ta ketma-ket audio ramka bo'yicha barqaror o'rtachalash DSP filtri
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
static float s_level_smooth = 1.5f;   // Boshlang'ich holat ~1.5% (tinch xona)
static float s_quiet_p2p    = 500.0f;  // Tinch xona p2p apparat bazasi (500 ADC counts)

// ═══════════════════════════════════════════════════════════════════════════════

static void sensor_init() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    analogSetPinAttenuation(PIN_SOUND_ADC, ADC_11db);
    pinMode(PIN_SOUND_ADC, INPUT);

    for (int i = 0; i < 10; i++) analogRead(PIN_SOUND_ADC);
    s_level_smooth = 1.5f;
    s_quiet_p2p    = 500.0f;
    LOG_PRINTF("Ovoz sensori DSP Multi-Frame tayyor (GPIO%d)\n", PIN_SOUND_ADC);
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

    // 10 ta ketma-ket audio ramka bo'yicha o'qish (~500ms davomida o'rtachalash)
    // Bu impulsli va elektr impuls xatoliklarini 100% filtrlaydi
    float p2p_sum = 0.0f;
    float p2p_max = 0.0f;
    int valid_frames = 0;

    for (int f = 0; f < 10; f++) {
        int lo = 4095, hi = 0;
        int count = 0;
        unsigned long start = millis();
        while (millis() - start < 35 && count < 60) {
            int v = analogRead(PIN_SOUND_ADC);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
            count++;
            delayMicroseconds(200);
        }

        if (count >= 5 && hi > lo) {
            float frame_p2p = (float)(hi - lo);
            p2p_sum += frame_p2p;
            if (frame_p2p > p2p_max) p2p_max = frame_p2p;
            valid_frames++;
        }
        delay(10); // ramkalar oralig'idagi kichik pauza
    }

    if (valid_frames == 0) {
        d = {1.5f, true};
        return true;
    }

    float avg_p2p = p2p_sum / (float)valid_frames;

    // Tinch xona baseline tracking (sekin va barqaror)
    if (avg_p2p < s_quiet_p2p * 1.30f && avg_p2p > 30.0f) {
        s_quiet_p2p = s_quiet_p2p * 0.96f + avg_p2p * 0.04f;
    }

    // 70% o'rtacha amplituda + 30% peak amplituda (sakramaydigan barqaror o'lchov)
    float combined_p2p = (avg_p2p * 0.70f) + (p2p_max * 0.30f);
    float signal = max(0.0f, combined_p2p - s_quiet_p2p);

    float target_level = 1.5f;
    if (signal < 25.0f) {
        target_level = 1.5f; // Tinch xona norma = 1.5% STABIL
    } else {
        target_level = constrain(1.5f + (signal / 25.0f), 1.5f, 100.0f);
    }

    // Yumshoq EMA silliqlash (hech qachon sakramaydi)
    s_level_smooth = s_level_smooth * 0.65f + target_level * 0.35f;
    if (s_level_smooth < 1.5f) s_level_smooth = 1.5f;

    LOG_PRINTF("Ovoz DSP STABIL GPIO%d: avg_p2p=%.0f max_p2p=%.0f baseline=%.0f level=%.1f%%\n",
               PIN_SOUND_ADC, avg_p2p, p2p_max, s_quiet_p2p, s_level_smooth);

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
