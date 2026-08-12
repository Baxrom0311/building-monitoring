#pragma once
/**
 * sound.h — Ovoz darajasi sensori (mikrofon ADC / Digital hybrid)
 *
 * AO (Analog) va DO (Digital) turlarini avtomatik aniqlaydigan universal datchik drayveri.
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
static float s_level_smooth = 7.0f; // Boshlang'ich holat ~7% (tinch xona)
static float s_quiet_p2p    = 550.0f; // Tinch xona p2p apparat bazasi (550 ADC counts)

// ═══════════════════════════════════════════════════════════════════════════════

static void sensor_init() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    analogSetPinAttenuation(PIN_SOUND_ADC, ADC_11db);
    pinMode(PIN_SOUND_ADC, INPUT);

    for (int i = 0; i < 10; i++) analogRead(PIN_SOUND_ADC);
    s_level_smooth = 7.0f;
    s_quiet_p2p    = 550.0f;
    LOG_PRINTF("Ovoz sensori gibrid drayver tayyor (GPIO%d, quiet_baseline=550)\n", PIN_SOUND_ADC);
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

    // 60ms namunalar oynasi (150 ta sample)
    int count = 0;
    int lo = 4095, hi = 0;
    long sum = 0;
    int digital_pulses = 0;
    bool last_state = false;
    int sat_count = 0;

    unsigned long start = millis();
    while (millis() - start < 60 && count < 150) {
        int v = analogRead(PIN_SOUND_ADC);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        sum += v;
        count++;

        bool cur_state = (v > 2000);
        if (cur_state != last_state) {
            digital_pulses++;
            last_state = cur_state;
        }

        if (v < 200 || v > 3900) sat_count++;

        delayMicroseconds(120);
    }

    if (count == 0) {
        d = {7.0f, true};
        return true;
    }

    float target_level = 7.0f;

    // A) Agar modul DO (Digital Output) piniga ulangan bo'lsa yoki to'yingan bo'lsa
    if (sat_count > (count / 2)) {
        float pulse_energy = max(0.0f, (float)digital_pulses - 2.0f);
        target_level = constrain(7.0f + (pulse_energy * 2.2f), 7.0f, 100.0f);
        LOG_PRINTF("Ovoz DO (Digital): pulses=%d level=%.1f%%\n", digital_pulses, target_level);
    } else {
        // B) Aniq AO (Analog Output) rejimi — 550.0f tinch xona bazasini ayirish
        float p2p = (float)(hi - lo);
        
        // Tinch xona p2p bazasini sekin moslashtirish
        if (p2p < s_quiet_p2p * 1.3f && p2p > 50.0f) {
            s_quiet_p2p = s_quiet_p2p * 0.98f + p2p * 0.02f;
        }

        float signal = max(0.0f, p2p - s_quiet_p2p);
        target_level = constrain(7.0f + (signal / 22.0f), 7.0f, 100.0f);
        LOG_PRINTF("Ovoz AO (Analog): hi=%d lo=%d p2p=%.0f baseline=%.0f level=%.1f%%\n", hi, lo, p2p, s_quiet_p2p, target_level);
    }

    // EMA silliqlashtirish: o'sish 0.35 (tez sezish), tushish 0.12
    float alpha = (target_level > s_level_smooth) ? 0.35f : 0.12f;
    s_level_smooth += (target_level - s_level_smooth) * alpha;

    if (s_level_smooth < 7.0f) s_level_smooth = 7.0f;

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
