#pragma once
/**
 * water.h — Industrial suv bosimi sensori (ADS1115 + HY-131)
 *
 * Apparat:
 *   ADS1115 16-bit ADC (I2C, 0x48, SDA=21, SCL=22)
 *   HY-131 bosim uzatgich: 0–0.6 MPa (0–6 bar), 4–20 mA
 *   Shunt rezistor: 165 Ω  →  0.66 V (4mA) .. 3.30 V (20mA)
 *   ADS1115 GAIN_ONE: ±4.096 V, 0.125 mV/bit
 *
 * Kanallar:
 *   A0 = Pastki bosim (kirish, boiler xona)
 *   A1 = Yuqori bosim (oxirgi qavat) — HAVE_PRESSURE_TOP bilan yoqiladi
 *
 * Impuls sensori (ixtiyoriy):
 *   GPIO25 = Suv oqimi (10 L/impuls, FALLING)
 *
 * Sensor API (main.cpp / lora_node.h dan chaqiriladi):
 *   sensor_init()              — ADS1115 + impuls sozlash
 *   sensor_connect() → bool   — ADS1115 topildimi
 *   sensor_read(SensorData&)  → bool — bosim + oqim o'qish
 *   sensor_build_json(...)    → String — backend JSON (faqat WiFi)
 *   sensor_do_register(...)   → bool — backend register (faqat WiFi)
 */

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>

#if 1  // JSON funksiyalar oddiy WiFi va RS485_LEAF rejimida ham kerak
  #include <ArduinoJson.h>
#endif

// ─── ADS1115 sozlamalari ─────────────────────────────────────────────────────
#ifndef ADS_SDA
  #define ADS_SDA    21
#endif
#ifndef ADS_SCL
  #define ADS_SCL    22
#endif
#define ADS_ADDR     0x48
#define MV_PER_BIT   0.125f    // GAIN_ONE: 4.096V / 32768

// ─── Shunt va tok chegaralari ────────────────────────────────────────────────
#ifndef SHUNT_OHM
  #define SHUNT_OHM    165.0f
#endif
#define SENSOR_MA_MIN   4.0f     // 4 mA = 0 bosim
#define SENSOR_MA_MAX  20.0f     // 20 mA = max bosim
#define SENSOR_ERR_LO   3.6f     // < 3.6 mA = sim uzilgan
#define SENSOR_ERR_HI  21.0f     // > 21 mA = qisqa tutashuv

// ─── Bosim oralig'i ──────────────────────────────────────────────────────────
#ifndef PRESSURE_MAX_BAR
  #define PRESSURE_MAX_BAR  6.0f   // HY-131: 0–0.6 MPa = 0–6 bar
#endif

// ─── EMA filtri ──────────────────────────────────────────────────────────────
#define EMA_ALPHA       0.15f

// ─── ADC oversample ──────────────────────────────────────────────────────────
#define ADC_OVERSAMPLE  16

// ─── Impuls sensor ───────────────────────────────────────────────────────────
#ifndef PIN_WATER_PULSE
  #define PIN_WATER_PULSE         25
#endif
#define WATER_LITERS_PER_PULSE  10.0f
#define DEBOUNCE_DELAY_MS       50

// ─── Bosim kanali holati ─────────────────────────────────────────────────────
struct PressureChannel {
    uint8_t channel;       // ADS1115 kanal (0–3)
    float   ema_bar;       // EMA filtrdan o'tgan bosim (bar)
    float   current_mA;    // Oxirgi tok o'qishi (mA)
    bool    initialized;   // Birinchi o'qish bo'ldimi
    bool    error;         // Sensor xatosi
};

// ─── Global holatlar ─────────────────────────────────────────────────────────
static Adafruit_ADS1115 g_ads;
static bool g_ads_ok = false;
static PressureChannel g_ch_bottom = { 0, 0, 0, false, false };
#ifdef HAVE_PRESSURE_TOP
static PressureChannel g_ch_top    = { 1, 0, 0, false, false };
#endif

static volatile unsigned long g_water_pulse_count = 0;
static volatile unsigned long g_last_water_pulse_ms = 0;
static float g_initial_volume_m3 = 0.0f;
static unsigned long g_last_read_pulses = 0;
static unsigned long g_last_read_time_ms = 0;

static void IRAM_ATTR water_pulse_isr() {
    unsigned long now = millis();
    if (now - g_last_water_pulse_ms > DEBOUNCE_DELAY_MS) {
        g_water_pulse_count++;
        g_last_water_pulse_ms = now;
    }
}

// ─── SensorData (suv) ────────────────────────────────────────────────────────
struct SensorData {
    float pressure_bottom_bar;   // Pastki bosim (bar)
    float pressure_top_bar;      // Yuqori bosim (bar)
    float flow_rate;             // Oqim tezligi (L/min)
    float volume_m3;             // Jami hajm (m3)
    float temperature_c;         // Harorat (C) — hozir ishlatilmaydi
    bool  valid;
};

// ─── ADS1115 yordamchi funksiyalar ───────────────────────────────────────────

/** ADC dan o'rtacha voltaj o'qish (V) */
static float _ads_read_voltage(uint8_t ch) {
    int32_t sum = 0;
    for (int i = 0; i < ADC_OVERSAMPLE; i++) {
        sum += g_ads.readADC_SingleEnded(ch);
        delayMicroseconds(500);
    }
    return ((float)sum / ADC_OVERSAMPLE) * MV_PER_BIT / 1000.0f;
}

/** Voltajdan tok (mA): I = V / R × 1000 */
static inline float _voltage_to_mA(float v) {
    return (v / SHUNT_OHM) * 1000.0f;
}

/** Tokdan bosim (bar): 4–20 mA → 0–max bar */
static inline float _mA_to_bar(float mA) {
    if (mA < SENSOR_MA_MIN) return 0.0f;
    float bar = (mA - SENSOR_MA_MIN) / (SENSOR_MA_MAX - SENSOR_MA_MIN) * PRESSURE_MAX_BAR;
    return constrain(bar, 0.0f, PRESSURE_MAX_BAR);
}

/** Bitta kanalni o'qish + EMA + xato tekshirish */
static void _update_channel(PressureChannel& ch) {
    float v = _ads_read_voltage(ch.channel);
    ch.current_mA = _voltage_to_mA(v);

    if (ch.current_mA < SENSOR_ERR_LO || ch.current_mA > SENSOR_ERR_HI) {
        ch.error = true;
        return;
    }
    ch.error = false;
    float bar = _mA_to_bar(ch.current_mA);

    if (!ch.initialized) {
        ch.ema_bar = bar;
        ch.initialized = true;
    } else {
        ch.ema_bar = EMA_ALPHA * bar + (1.0f - EMA_ALPHA) * ch.ema_bar;
    }
}

// ─── Sensor API ──────────────────────────────────────────────────────────────

// I2C avtobusini skanerlash — faqat ADS1115 kutilgan manzilda topilmasa
// chaqiriladi (diagnostika: simlash/quvvat muammosini tezda ko'rsatadi).
static void _i2c_scan_diagnostic() {
    LOG_PRINTF("I2C skan (SDA=%d SCL=%d):\n", (int)ADS_SDA, (int)ADS_SCL);
    int found_count = 0;
    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            LOG_PRINTF("  0x%02X -> topildi\n", addr);
            found_count++;
        }
    }
    if (found_count == 0) LOG_PRINTLN("  -> hech narsa topilmadi (avtobus bo'sh yoki qotib qolgan)");
}

static void sensor_init() {
    // ADS1115 init
    Wire.begin(ADS_SDA, ADS_SCL);
    Wire.setTimeOut(50);  // ms — SDA/SCL qotib qolsa ham cheksiz osilib qolmasin

    g_ads_ok = g_ads.begin(ADS_ADDR);
    if (g_ads_ok) {
        g_ads.setGain(GAIN_ONE);
        g_ads.setDataRate(RATE_ADS1115_128SPS);
        LOG_PRINTLN("ADS1115 tayyor (GAIN_ONE, 128SPS)");
    } else {
        LOG_PRINTLN("XATO: ADS1115 topilmadi (0x48)!");
        _i2c_scan_diagnostic();
    }

    // Impuls sensor
    pinMode(PIN_WATER_PULSE, INPUT_PULLUP);
    Preferences prefs;
    prefs.begin("water", false);
    g_water_pulse_count = prefs.getULong("pulses", 0);
    g_initial_volume_m3 = prefs.getFloat("base_vol", 0.0f);
    prefs.end();
    attachInterrupt(digitalPinToInterrupt(PIN_WATER_PULSE), water_pulse_isr, FALLING);
    g_last_read_pulses = g_water_pulse_count;
    g_last_read_time_ms = millis();

    LOG_PRINTF("Suv sensor: ADS1115(0x%02X) Shunt=%dOhm Max=%.0f bar | Impuls: GPIO%d\n",
               ADS_ADDR, (int)SHUNT_OHM, PRESSURE_MAX_BAR, PIN_WATER_PULSE);
}

static bool sensor_connect() {
    return g_ads_ok;
}

static bool sensor_read(SensorData& d) {
    if (!g_ads_ok) { d.valid = false; return false; }

    if (g_cfg.test_mode) {
        d.pressure_bottom_bar = 3.2f + (random(0, 100) / 200.0f);
        d.pressure_top_bar    = 1.8f + (random(0, 100) / 200.0f);
        d.flow_rate           = 12.5f + (random(0, 100) / 25.0f);
        static float sim_vol  = 48.250f;
        sim_vol += (d.flow_rate / 60.0f) * (30.0f / 1000.0f);
        d.volume_m3     = sim_vol;
        d.temperature_c = NAN;
        d.valid = true;
        LOG_PRINTF("[TEST] Suv: p=%.3f/%.3f bar | oqim=%.1f L/min | hajm=%.3f m3\n",
                   d.pressure_bottom_bar, d.pressure_top_bar, d.flow_rate, d.volume_m3);
        return true;
    }

    // ── Bosim o'qish (ADS1115, 4-20mA) ──────────────────────────────────────
    _update_channel(g_ch_bottom);
    d.pressure_bottom_bar = g_ch_bottom.error ? 0.0f : g_ch_bottom.ema_bar;

#ifdef HAVE_PRESSURE_TOP
    _update_channel(g_ch_top);
    d.pressure_top_bar = g_ch_top.error ? 0.0f : g_ch_top.ema_bar;
#else
    d.pressure_top_bar = 0.0f;
#endif

    // ── Impuls — oqim tezligi ────────────────────────────────────────────────
    unsigned long pulses_now = g_water_pulse_count;
    unsigned long time_now   = millis();
    unsigned long dt_ms = time_now - g_last_read_time_ms;
    unsigned long dp    = pulses_now - g_last_read_pulses;

    if (dt_ms > 0 && dp > 0) {
        d.flow_rate = (dp * WATER_LITERS_PER_PULSE) / (float)dt_ms * 60000.0f;
    } else {
        d.flow_rate = 0.0f;
    }

    // ── Jami hajm ────────────────────────────────────────────────────────────
    d.volume_m3 = g_initial_volume_m3 + ((float)pulses_now * WATER_LITERS_PER_PULSE / 1000.0f);
    d.temperature_c = NAN;
    // Bosim kanali xato bo'lsa ham (0 bar bilan) yuborilaveradi — jim qolib
    // ketmasligi uchun. Faqat ADS1115 umuman topilmasa (g_ads_ok=false)
    // sensor_read() yuqorida false qaytaradi va bu yerga yetib kelmaydi.
    d.valid = true;

    g_last_read_pulses  = pulses_now;
    g_last_read_time_ms = time_now;

    // ── Impuls saqlash (har 10 impuls yoki 5 daqiqada) ───────────────────────
    static unsigned long last_saved_pulses  = 0;
    static unsigned long last_saved_time_ms = 0;
    if (pulses_now - last_saved_pulses >= 10 ||
        (time_now - last_saved_time_ms > 300000UL)) {
        Preferences prefs;
        prefs.begin("water", false);
        prefs.putULong("pulses", pulses_now);
        prefs.end();
        last_saved_pulses  = pulses_now;
        last_saved_time_ms = time_now;
    }

    // ── Log ──────────────────────────────────────────────────────────────────
    if (g_ch_bottom.error) {
        LOG_PRINTF("Suv: XATO tok=%.2f mA (%s)\n", g_ch_bottom.current_mA,
                   g_ch_bottom.current_mA < SENSOR_ERR_LO ? "uzilgan" : "qisqa");
    } else {
        LOG_PRINTF("Suv: p=%.3f bar (%.2f mA) | oqim=%.1f L/min | hajm=%.3f m3\n",
                   g_ch_bottom.ema_bar, g_ch_bottom.current_mA,
                   d.flow_rate, d.volume_m3);
    }
    return true;
}

#ifndef RS485_LEAF
// app_register() WiFi/core-api.h talab qiladi — RS-485 leaf'da yo'q, faqat
// oddiy WiFi rejimida kerak.
static bool sensor_do_register(const char* device_id, const char* fw_version) {
    return app_register(device_id, "water", "ads1115_hy131", "", fw_version, 0);
}
#endif

// JSON qurish — oddiy WiFi va RS485_LEAF rejimida ham kerak.
static String sensor_build_json(const char* device_id,
                                 const char* fw_ver,
                                 const SensorData& d) {
    StaticJsonDocument<384> doc;
    doc["device_id"]    = device_id;
    doc["utility_type"] = "water";
    doc["sensor_type"]  = "ads1115_hy131";
    doc["fw_version"]   = fw_ver;
    if (g_cfg.test_mode) doc["is_test_device"] = true;

    if (!isnan(d.pressure_bottom_bar)) doc["pressure_bottom_bar"] = serialized(String(d.pressure_bottom_bar, 3));
    if (!isnan(d.pressure_top_bar))    doc["pressure_top_bar"]    = serialized(String(d.pressure_top_bar, 3));
    if (!isnan(d.flow_rate))           doc["flow_rate"]           = serialized(String(d.flow_rate, 3));
    if (!isnan(d.volume_m3))           doc["volume_m3"]           = serialized(String(d.volume_m3, 3));
    if (!isnan(d.temperature_c))       doc["temperature_c"]       = serialized(String(d.temperature_c, 1));

    String out;
    serializeJson(doc, out);
    return out;
}

void sensor_set_volume(float val) {
    Preferences prefs;
    prefs.begin("water", false);
    prefs.putFloat("base_vol", val);
    prefs.putULong("pulses", 0);
    prefs.end();

    g_water_pulse_count = 0;
    g_initial_volume_m3 = val;
    g_last_read_pulses = 0;
    LOG_PRINTF("Suv base hajmi %.3f m3 qilib o'rnatildi\n", val);
}
