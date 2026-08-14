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

// ─── MQ135 havo sifati sensori (ixtiyoriy, -DHAVE_MQ135) ─────────────────────
// Analog AOUT → GPIO[PIN_MQ135]. Yuqori qiymat = havo ifloslangan (gaz/tutun).
// soil.h dagi bilan bir xil naqsh — bitta ESP32'da ovoz VA havo sifati birga.
#ifdef HAVE_MQ135
  #ifndef PIN_MQ135
    #define PIN_MQ135  35        // GPIO35 = ADC1_CH7 (PIN_SOUND_ADC=34 bilan ziddiyatsiz)
  #endif
  #define MQ135_SAMPLES  16
  // Uzilgan/qisqa tutashgan MQ135 rels kuchlanishiga (0 yoki 4095) yopishib
  // qoladi — bu holatni haqiqiy o'lchovdan ajratish uchun ADC rels chetidan
  // shuncha birlik ichidagi qiymat nosozlik deb hisoblanadi.
  #define MQ135_FAULT_MARGIN  20   // ADC birligi (0..4095 oralig'idan)
#endif

struct SensorData {
    float level;   // 0–100 %
#ifdef HAVE_MQ135
    int   air_raw;   // MQ135 xom ADC (0–4095)
    float air_v;     // MQ135 kuchlanishi (V)
    float air_pct;   // Nisbiy havo ifloslanishi % (yuqori = yomonroq)
#endif
    bool  valid;
};

// ─── Ichki holat ──────────────────────────────────────────────────────────────
static float s_level_smooth = 1.5f;   // Boshlang'ich holat ~1.5% (tinch xona)
static float s_quiet_p2p    = 40.0f;   // Tinch xona toza p2p apparat bazasi
static bool  s_mic_fault    = false;   // true = mikrofon hali haqiqiy bazaga ega emas

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

// Tinch xona p2p bazasini o'lchash. Toza namuna umuman topilmasa (mikrofon
// uzilgan/nosoz) soxta baza o'rnatilmaydi — false qaytaradi, s_quiet_p2p
// o'zgarishsiz qoladi.
static bool _calibrate_baseline() {
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
    if (p2p_cnt == 0) return false;
    s_quiet_p2p = p2p_sum / (float)p2p_cnt;
    return true;
}

static void sensor_init() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    pinMode(PIN_SOUND_ADC, INPUT);

    for (int i = 0; i < 10; i++) analogRead(PIN_SOUND_ADC);
    s_level_smooth = 1.5f;

    // Yoqilgan vaqtda xonadagi haqiqiy apparat p2p bazasini o'lchab olish.
    // Muvaffaqiyatsiz bo'lsa (p2p_cnt==0) soxta baza (masalan 500.0f) qo'yilmaydi —
    // bu signal = max(0, avg_p2p - baza) ni doim floor qilib qo'yardi va uzilgan
    // mikrofon "tinch xona" bilan adashtirilardi. Buning o'rniga xato bayrog'i
    // qo'yiladi va sensor_read() har chaqirilganda qayta kalibrovka urinadi.
    if (_calibrate_baseline()) {
        s_mic_fault = false;
        LOG_PRINTF("Ovoz sensori toza P2P drayver tayyor (GPIO%d, quiet_baseline=%.0f)\n", PIN_SOUND_ADC, s_quiet_p2p);
    } else {
        s_mic_fault = true;
        LOG_PRINTF("XATO: Ovoz sensori (GPIO%d) kalibrovka vaqtida toza namuna bermadi — mikrofon uzilgan yoki nosoz\n", PIN_SOUND_ADC);
    }

#ifdef HAVE_MQ135
    pinMode(PIN_MQ135, INPUT);
    for (int i = 0; i < 5; i++) { analogRead(PIN_MQ135); }
    LOG_PRINTF("MQ135 havo sifati sensori tayyor (GPIO%d)\n", PIN_MQ135);
#endif
}

static bool sensor_connect() { return true; }

static bool sensor_read(SensorData& d) {
    if (g_cfg.test_mode) {
        static float sim = 25.0f;
        sim += random(-20, 21) * 0.5f;
        sim = constrain(sim, 0.0f, 95.0f);
        d.level = sim;
        d.valid = true;
#ifdef HAVE_MQ135
        d.air_raw = 1200; d.air_v = 0.97f; d.air_pct = 29.0f;
#endif
        return true;
    }

    // Boshlang'ich kalibrovka muvaffaqiyatsiz bo'lgan bo'lsa — har o'qishda
    // qayta urinib ko'ramiz (mikrofon keyinroq ulanishi/tuzalishi mumkin).
    if (s_mic_fault) {
        if (_calibrate_baseline()) {
            s_mic_fault = false;
            LOG_PRINTF("Ovoz sensori qayta kalibrovka qilindi (GPIO%d, quiet_baseline=%.0f)\n", PIN_SOUND_ADC, s_quiet_p2p);
        } else {
            LOG_PRINTF("Ovoz sensori xato: mikrofon hali ham toza namuna bermayapti (GPIO%d)\n", PIN_SOUND_ADC);
            d.level = 0.0f;
            d.valid = false;
            return false;
        }
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
        LOG_PRINTF("Ovoz sensori xato: bu siklda barcha 8 ramka filtrlab tashlandi (GPIO%d)\n", PIN_SOUND_ADC);
        d.level = 0.0f;
        d.valid = false;
        return false;
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

    d.level = s_level_smooth;
    d.valid = true;

#ifdef HAVE_MQ135
    long asum = 0;
    for (int i = 0; i < MQ135_SAMPLES; i++) {
        asum += analogRead(PIN_MQ135);
        delayMicroseconds(500);
    }
    d.air_raw = (int)(asum / MQ135_SAMPLES);

    // ── Nosozlik (uzilgan/qisqa tutashgan MQ135) tekshiruvi ─────────────────
    if (d.air_raw <= MQ135_FAULT_MARGIN || d.air_raw >= 4095 - MQ135_FAULT_MARGIN) {
        d.air_v   = NAN;
        d.air_pct = NAN;
        LOG_PRINTF("MQ135: XATO datchik (uzilgan/qisqa tutashgan?) raw=%d\n", d.air_raw);
    } else {
        d.air_v   = d.air_raw * 3.3f / 4095.0f;
        d.air_pct = constrain(d.air_raw / 4095.0f * 100.0f, 0.0f, 100.0f);  // nisbiy (yuqori=yomonroq)
        LOG_PRINTF("MQ135: raw=%d  %.2fV  havo=%.0f%% (yuqori=yomonroq)\n",
                   d.air_raw, d.air_v, d.air_pct);
    }
#endif
    return true;
}

void sensor_set_volume(float) {}

#ifndef RS485_LEAF
// app_register() WiFi/core-api.h talab qiladi — RS-485 leaf'da yo'q, faqat
// oddiy WiFi rejimida kerak.
static bool sensor_do_register(const char* device_id, const char* fw_version) {
#ifdef HAVE_MQ135
    return app_register(device_id, "sound", "microphone", "", fw_version, 0, "sound_air");
#else
    return app_register(device_id, "sound", "microphone", "", fw_version, 0);
#endif
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
#ifdef HAVE_MQ135
    // d.air_raw/air_pct faqat d.valid==true bo'lganda to'ldiriladi (sensor_read
    // MQ135'ni ovoz o'qishi muvaffaqiyatli bo'lgandagina o'qiydi) — shuning uchun
    // shu yerda ham xuddi shu shartga bog'laymiz, aks holda boshlanmagan (garbage)
    // qiymat JSON'ga sizib chiqadi.
    if (d.valid) {
        doc["air_raw"] = d.air_raw;
        if (!isnan(d.air_pct)) doc["air_pct"] = serialized(String(d.air_pct, 0));
    }
#endif
    String out;
    serializeJson(doc, out);
    return out;
}
