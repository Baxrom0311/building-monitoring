#pragma once
/**
 * sound.h — Ovoz darajasi sensori (mikrofon ADC / Glitch-Proof P2P)
 *
 * Apparat tok impulslari (0 va 4095) filtrlangan toza AC audio o'lchash drayveri
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
static float s_quiet_p2p    = 40.0f;   // Tinch xona toza p2p apparat bazasi

// Single frame P2P (tok va 0/4095 apparat impulslari 100% filtrlangan)
static float _get_p2p_clean() {
    int lo = 4095, hi = 0;
    int valid_samples = 0;
    unsigned long start = millis();
    while (millis() - start < 45) {
        int v = analogRead(PIN_SOUND_ADC);
        // 0 va 4095 elektr sakrashlarini filtrlash (faqat toza audio)
        if (v >= 10 && v <= 4080) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
            valid_samples++;
        }
        delayMicroseconds(100);
    }
    if (valid_samples < 10 || hi <= lo) return 0.0f;
    return (float)(hi - lo);
}

// ═══════════════════════════════════════════════════════════════════════════════

static void sensor_init() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    pinMode(PIN_SOUND_ADC, INPUT);

    for (int i = 0; i < 10; i++) analogRead(PIN_SOUND_ADC);
    s_level_smooth = 1.5f;

    // Yoqilgan vaqtda xonadagi haqiqiy apparat p2p bazasini o'lchab olish
    float p2p_sum = 0.0f;
    int p2p_cnt = 0;
    for (int i = 0; i < 15; i++) {
        float p = _get_p2p_clean();
        if (p > 10.0f) {
            p2p_sum += p;
            p2p_cnt++;
        }
        delay(10);
    }
    if (p2p_cnt > 0) {
        s_quiet_p2p = p2p_sum / (float)p2p_cnt;
    } else {
        s_quiet_p2p = 500.0f;
    }

    LOG_PRINTF("Ovoz sensori toza P2P drayver tayyor (GPIO%d, quiet_baseline=%.0f)\n", PIN_SOUND_ADC, s_quiet_p2p);
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

    // 8 ta ketma-ket toza audio ramka o'qish (o'rtachalash)
    float p2p_sum = 0.0f;
    int valid_count = 0;

    for (int f = 0; f < 8; f++) {
        float p = _get_p2p_clean();
        if (p > 0.0f) {
            p2p_sum += p;
            valid_count++;
        }
        delay(10);
    }

    if (valid_count == 0) {
        d = {1.5f, true};
        return true;
    }

    float avg_p2p = p2p_sum / (float)valid_count;

    // Tinch xona p2p bazasini sekin va barqaror kuzatish
    if (avg_p2p < s_quiet_p2p * 1.25f && avg_p2p > 10.0f) {
        s_quiet_p2p = s_quiet_p2p * 0.96f + avg_p2p * 0.04f;
    }

    float signal = max(0.0f, avg_p2p - s_quiet_p2p);

    float target_level = 1.5f;
    if (signal < 20.0f) {
        target_level = 1.5f; // Tinch xona norma = 1.5% ANIQ VA STABIL
    } else {
        target_level = constrain(1.5f + (signal / 20.0f), 1.5f, 100.0f);
    }

    // Yumshoq EMA silliqlash
    s_level_smooth = s_level_smooth * 0.60f + target_level * 0.40f;
    if (s_level_smooth < 1.5f) s_level_smooth = 1.5f;

    LOG_PRINTF("Ovoz ADC GPIO%d: avg_p2p=%.1f baseline=%.1f level=%.1f%%\n",
               PIN_SOUND_ADC, avg_p2p, s_quiet_p2p, s_level_smooth);

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
