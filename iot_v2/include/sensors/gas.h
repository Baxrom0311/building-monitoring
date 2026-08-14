#pragma once
/**
 * gas.h — Industrial gaz bosimi sensori (ADS1115 + 4-20mA transmitter) + impuls oqim
 *
 * Apparat:
 *   ADS1115 16-bit ADC (I2C, 0x48, SDA=21, SCL=22)
 *   4-20mA bosim transmitteri (past/o'rta bosimli gaz tizimi uchun)
 *   Shunt rezistor: 165 Ω (real transmitter datasheet bo'yicha tekshirib
 *   kerak bo'lsa -DSHUNT_OHM bilan almashtiring)
 *   ADS1115 GAIN_ONE: ±4.096 V, 0.125 mV/bit
 *
 *   ESKI VERSIYA ESP32 ichki ADC (GPIO35, analogRead) ishlatgan edi — bu
 *   past voltajlarda (past bosimli gaz diapazoni) nochiziqli/shovqinli
 *   bo'lgani uchun ADS1115'ga o'tkazildi (suv sensoridagi kabi).
 *
 * Kanal:
 *   A0 = Gaz bosimi
 *
 * Pulse (oqim) sensori — o'zgarmadi:
 *   GPIO26 = Gaz oqimi impuls hisoblagichi (FALLING)
 *
 * Sensor API (main.cpp dan chaqiriladi):
 *   sensor_init()             — ADS1115 + impuls sozlash
 *   sensor_connect() → bool  — ADS1115 topildimi
 *   sensor_read(SensorData&) → bool  — bosim + oqim o'qish
 *   sensor_build_json(...)   → String — backend JSON
 *   sensor_do_register(...)  → bool  — backend ro'yxatdan o'tish
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
#ifndef ADS_ADDR
  #define ADS_ADDR   0x48
#endif
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
// Gaz tizimi uchun odatda past bosim: 0.02–0.5 bar (past bosimli uy gazi)
// Yoki 0–5 bar (o'rta bosimli). Sensor tipiga qarab -DPRESSURE_MAX_BAR
// build_flag orqali o'zgartiring.
#ifndef PRESSURE_MAX_BAR
  #define PRESSURE_MAX_BAR  5.0f
#endif

// ─── EMA filtri ──────────────────────────────────────────────────────────────
#define EMA_ALPHA       0.15f

// ─── ADC oversample ──────────────────────────────────────────────────────────
#define ADC_OVERSAMPLE  16

// ─── Pulse sensor (gaz oqimi) ────────────────────────────────────────────────
#ifndef PIN_GAS_PULSE
  #define PIN_GAS_PULSE         26     // GPIO26 gas flow pulse input
#endif
#ifndef GAS_M3_PER_PULSE
  #define GAS_M3_PER_PULSE       0.01f  // 10 litr per pulse = 0.01 m3 (o'zgartirish mumkin)
#endif
#define DEBOUNCE_DELAY_MS     50     // Shovqindan saqlash millisoniyalari

static volatile unsigned long g_gas_pulse_count = 0;
static volatile unsigned long g_last_gas_pulse_ms = 0;
static float g_initial_volume_m3 = 0.0f;
static unsigned long g_last_read_pulses = 0;
static unsigned long g_last_read_time_ms = 0;

static void IRAM_ATTR gas_pulse_isr() {
    unsigned long now = millis();
    if (now - g_last_gas_pulse_ms > DEBOUNCE_DELAY_MS) {
        g_gas_pulse_count++;
        g_last_gas_pulse_ms = now;
    }
}

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
static PressureChannel g_ch_pressure = { 0, 0, 0, false, false };

// ─── SensorData (gaz) ─────────────────────────────────────────────────────────
struct SensorData {
    float pressure_bar;  // Gaz bosimi, bar
    float flow_rate;     // Oqim tezligi, m3/h
    float volume_m3;     // Jami hajm, m3
    float temperature_c; // Harorat, C (jismoniy sensor yo'q — doim NAN)
    bool  valid;
};

// ─── ADS1115 yordamchi funksiyalar ───────────────────────────────────────────

/** ADC dan o'rtacha voltaj o'qish (V) */
static float _ads_read_voltage(uint8_t ch) {
    int32_t sum = 0;
    int count = 0;
    unsigned long t0 = millis();
    for (int i = 0; i < ADC_OVERSAMPLE; i++) {
        // I2C shina vaqti-vaqti bilan sekinlashsa (to'liq o'lik emas, lekin
        // beqaror), har bir readADC_SingleEnded() Wire.setTimeOut() chegarasi
        // (50ms) gacha cho'zilishi mumkin — 16 marta ketma-ket bitta kanal
        // uchun sekundgacha bloklashi mumkin edi. Kamida yarmini yig'gandan
        // keyin umumiy vaqt byudjetidan oshsa, qolganini kutmasdan hozirgi
        // o'rtachani qaytaramiz — eng yomon holatni ~2x qisqartiradi.
        if (i >= ADC_OVERSAMPLE / 2 && millis() - t0 > 150) break;
        sum += g_ads.readADC_SingleEnded(ch);
        count++;
        delayMicroseconds(500);
    }
    return ((float)sum / count) * MV_PER_BIT / 1000.0f;
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

// ─── Sensor API ───────────────────────────────────────────────────────────────

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

    // Pulse sensor
    pinMode(PIN_GAS_PULSE, INPUT_PULLUP);

    // Preferencesdan yuklash
    Preferences prefs;
    prefs.begin("gas", false);
    g_gas_pulse_count = prefs.getULong("pulses", 0);
    g_initial_volume_m3 = prefs.getFloat("base_vol", 0.0f);
    prefs.end();

    attachInterrupt(digitalPinToInterrupt(PIN_GAS_PULSE), gas_pulse_isr, FALLING);
    g_last_read_pulses = g_gas_pulse_count;
    g_last_read_time_ms = millis();

    LOG_PRINTF("Gaz sensor: ADS1115(0x%02X) Shunt=%dOhm Max=%.1f bar | Impuls: GPIO%d\n",
               ADS_ADDR, (int)SHUNT_OHM, PRESSURE_MAX_BAR, PIN_GAS_PULSE);
}

static bool sensor_connect() {
    // Test rejimida ADS1115 chipi shart emas — simulyatsiya qiymati fizik
    // datchiksiz (masalan faqat ESP32+LCD stendida) ham ishlashi kerak.
    return g_cfg.test_mode || g_ads_ok;
}

static bool sensor_read(SensorData& d) {
    if (g_cfg.test_mode) {
        d.pressure_bar  = 0.23f + (random(0, 100) / 1000.0f);     // 0.23 - 0.33 bar (norma atrofida, GAS_NOMINAL=0.27)
        d.flow_rate     = 1.5f + (random(0, 100) / 100.0f);       // 1.5 - 2.5 m3/h

        static float sim_volume = 1250.450f;
        sim_volume += (d.flow_rate / 3600.0f) * 30.0f;            // 30 soniyada o'tgan hajm m3 da
        d.volume_m3     = sim_volume;
        d.temperature_c = NAN;
        d.valid = true;

        LOG_PRINTF("[TEST MODE] Gaz: bosim=%.3f bar | oqim=%.3f m3/h | hajm=%.3f m3\n",
                      d.pressure_bar, d.flow_rate, d.volume_m3);
        return true;
    }

    // ── Bosim o'qish (ADS1115, 4-20mA) ──────────────────────────────────────
    // XATO bo'lsa NAN — build_json tushirib qoldiradi (uzilgan datchik 0 bar
    // bo'lib "sog'lom" ko'rinmasin; audit topilmasi).
    _update_channel(g_ch_pressure);
    d.pressure_bar = g_ch_pressure.error ? NAN : g_ch_pressure.ema_bar;

    // ── Impuls — oqim tezligi (m3/h) ─────────────────────────────────────────
    unsigned long current_pulses = g_gas_pulse_count;
    unsigned long time_now = millis();
    unsigned long time_diff_ms = time_now - g_last_read_time_ms;
    unsigned long pulse_diff = current_pulses - g_last_read_pulses;

    if (time_diff_ms > 0) {
        float m3 = (float)pulse_diff * GAS_M3_PER_PULSE;
        d.flow_rate = (m3 / (float)time_diff_ms) * 3600000.0f;
    } else {
        d.flow_rate = 0.0f;
    }

    // ── Jami hajm ────────────────────────────────────────────────────────────
    d.volume_m3 = g_initial_volume_m3 + ((float)current_pulses * GAS_M3_PER_PULSE);
    d.temperature_c = NAN;
    // Bosim kanali xato bo'lsa ham (yoki ADS1115 umuman topilmagan bo'lsa,
    // d.pressure_bar NaN bo'ladi) impuls hisoblagichi (PIN_GAS_PULSE, ADS1115'ga
    // bog'liq emas) mustaqil ishlayveradi — shuning uchun oqim/hajm baribir
    // yuboriladi, faqat bosim maydoni jim qoladi (isnan() orqali).
    d.valid = true;

    g_last_read_pulses = current_pulses;
    g_last_read_time_ms = time_now;

    // Har 10 impulsda yoki 5 daqiqada Preferences-ga saqlaymiz
    static unsigned long last_saved_pulses = 0;
    static unsigned long last_saved_time_ms = 0;
    if (current_pulses - last_saved_pulses >= 10 || (time_now - last_saved_time_ms > 300000UL)) {
        Preferences prefs;
        prefs.begin("gas", false);
        prefs.putULong("pulses", current_pulses);
        prefs.end();
        last_saved_pulses = current_pulses;
        last_saved_time_ms = time_now;
    }

    // ── Log ──────────────────────────────────────────────────────────────────
    if (g_ch_pressure.error) {
        LOG_PRINTF("Gaz: XATO tok=%.2f mA (%s) | oqim=%.3f m3/h | jami=%.3f m3 (pulses=%lu)\n",
                   g_ch_pressure.current_mA,
                   g_ch_pressure.current_mA < SENSOR_ERR_LO ? "uzilgan" : "qisqa",
                   d.flow_rate, d.volume_m3, current_pulses);
    } else {
        LOG_PRINTF("Gaz: bosim=%.3f bar (%.2f mA) | oqim=%.3f m3/h | jami=%.3f m3 (pulses=%lu)\n",
                   g_ch_pressure.ema_bar, g_ch_pressure.current_mA,
                   d.flow_rate, d.volume_m3, current_pulses);
    }
    return true;
}

#ifndef RS485_LEAF
// app_register() WiFi/core-api.h talab qiladi — RS-485 leaf'da yo'q, faqat
// oddiy WiFi rejimida kerak.
static bool sensor_do_register(const char* device_id, const char* fw_version) {
    const char* s_type = "gas_pulse_flow";
    return app_register(device_id, "gas", s_type, "", fw_version, 0);
}
#endif

// JSON qurish — oddiy WiFi va RS485_LEAF rejimida ham kerak.
static String sensor_build_json(const char* device_id,
                                 const char* fw_ver,
                                 const SensorData& d) {
    StaticJsonDocument<256> doc;
    doc["device_id"]    = device_id;
    doc["utility_type"] = "gas";
    doc["sensor_type"]  = "gas_pulse_flow";
    doc["fw_version"]   = fw_ver;
    if (g_cfg.test_mode) doc["is_test_device"] = true;

    if (!isnan(d.pressure_bar))  doc["pressure_bar"] = serialized(String(d.pressure_bar, 3));
    if (!isnan(d.flow_rate))     doc["flow_rate"]    = serialized(String(d.flow_rate, 3));
    if (!isnan(d.volume_m3))     doc["volume_m3"]    = serialized(String(d.volume_m3, 3));
    if (!isnan(d.temperature_c)) doc["temperature_c"] = serialized(String(d.temperature_c, 1));

    String out;
    serializeJson(doc, out);
    return out;
}

void sensor_set_volume(float val) {
    Preferences prefs;
    prefs.begin("gas", false);
    prefs.putFloat("base_vol", val);
    prefs.putULong("pulses", 0);
    prefs.end();

    g_gas_pulse_count = 0;
    g_initial_volume_m3 = val;
    g_last_read_pulses = 0;
    LOG_PRINTF("Gaz base hajmi %.3f m3 qilib o'rnatildi\n", val);
}
