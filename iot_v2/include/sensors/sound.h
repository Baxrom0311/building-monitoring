#pragma once
/**
 * sound.h — Ovoz darajasi sensori (mikrofon ADC)
 *
 * Signal filtrlash: USB va elektr shovqinlaridan xoli Mean Absolute Deviation (MAD)
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

// ADC raqamli audio signal energiyasi (Mean Absolute Deviation - MAD)
// USB va elektr apparat shovqinlarini filtrlash uchun Mean Deviation ishlatiladi.
static float _sound_average_deviation() {
    long sum = 0;
    int count = 0;
    static int samples[200];
    
    unsigned long start = millis();
    while (millis() - start < 60 && count < 200) {
        int v = analogRead(PIN_SOUND_ADC);
        samples[count++] = v;
        sum += v;
        delayMicroseconds(100);
    }
    if (count == 0) return 0.0f;
    
    float mean = (float)sum / (float)count;
    float dev_sum = 0.0f;
    for (int i = 0; i < count; i++) {
        dev_sum += fabs((float)samples[i] - mean);
    }
    return dev_sum / (float)count;
}

// ═══════════════════════════════════════════════════════════════════════════════

static void sensor_init() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    analogSetPinAttenuation(PIN_SOUND_ADC, ADC_11db);
    pinMode(PIN_SOUND_ADC, INPUT);

    for (int i = 0; i < 10; i++) analogRead(PIN_SOUND_ADC);
    s_level_smooth = 7.0f;
    LOG_PRINTF("Ovoz sensori MAD filtr tayyor (GPIO%d, ADC_11db)\n", PIN_SOUND_ADC);
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

    float dev = _sound_average_deviation();

    // Tinch xona MAD baseline = ~5-12 ADC counts
    // Odatiy muloqot / gapirish = ~60-180 ADC counts
    // Baland shovqin / baqirish = 300+ ADC counts
    
    float sound_energy = max(0.0f, dev - 10.0f);
    
    // Tinch xona norma = 7.0%
    // 330.0 MAD deviation = 100% full scale
    float target_level = constrain(7.0f + (sound_energy / 3.3f), 7.0f, 100.0f);

    // EMA silliqlashtirish: o'sish 0.35 (tez sezish), tushish 0.12
    float alpha = (target_level > s_level_smooth) ? 0.35f : 0.12f;
    s_level_smooth += (target_level - s_level_smooth) * alpha;

    if (s_level_smooth < 7.0f) s_level_smooth = 7.0f;

    LOG_PRINTF("Ovoz ADC GPIO%d: dev=%.1f energy=%.1f level=%.1f%%\n", PIN_SOUND_ADC, dev, sound_energy, s_level_smooth);

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
