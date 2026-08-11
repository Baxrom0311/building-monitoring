/**
 * Meter Monitor — ESP32 Firmware v4.1.0
 *
 * Arxitektura:
 *   core/log.h       → Debug logging
 *   core/config.h    → NVS konfiguratsiya
 *   core/wifi.h      → WiFi (non-blocking reconnect)
 *   core/http.h      → HTTP + OTA
 *   core/api.h       → Backend API
 *   sensors/dlms.h   → DLMS/HDLC protokol
 *   sensors/*.h      → Sensor modullari
 *   display/*.h      → LCD display modullari
 */

#define FW_VERSION "4.2.0"

// EX518 XOM IEC62056-21 (Mode C) TEST — WiFi/LoRa YO'Q, faqat RS-485 + Serial
// log. EX518 pasporti (rasmiy PDF) faqat IEC62056-21 standartini tilga oladi —
// DLMS/COSEM (HDLC/AARQ) EMAS, shuning uchun TE71/TE73 dlms.h bu yerda
// ishlatilmaydi. RS-485 sim: A=klemma30, B=klemma31 (28/29 — impuls chiqishi,
// RS-485 EMAS!). Mavjud electricity.h/main.cpp rejimlariga umuman tegmaydi.
#ifdef EX518_TEST

#include <Arduino.h>
#include <string.h>

#define PIN_RX   16
#define PIN_TX   17
#define PIN_DE    4

static const uint32_t BAUD_TABLE[] = {300, 600, 1200, 2400, 4800, 9600, 19200};

static void de_tx() { digitalWrite(PIN_DE, HIGH); delayMicroseconds(50); }
static void de_rx() { Serial2.flush(); delayMicroseconds(50); digitalWrite(PIN_DE, LOW); }

static void print_hex_ascii(const char* label, const uint8_t* buf, size_t len) {
    Serial.printf("%s (%d bayt): ", label, (int)len);
    for (size_t i = 0; i < len; i++) Serial.printf("%02X ", buf[i]);
    Serial.print(" | \"");
    for (size_t i = 0; i < len; i++) {
        char c = (char)buf[i];
        Serial.print((c >= 32 && c < 127) ? c : '.');
    }
    Serial.println("\"");
}

// Idle-timeout: har baytda taymer qayta boshlanadi — sekin oqib kelayotgan
// javobni kesib qo'ymaslik uchun.
static size_t read_with_timeout(uint8_t* buf, size_t max, unsigned long timeout_ms) {
    size_t n = 0;
    unsigned long last = millis();
    while (millis() - last < timeout_ms && n < max) {
        if (Serial2.available()) {
            buf[n++] = (uint8_t)Serial2.read();
            last = millis();
        }
        yield();
    }
    return n;
}

void setup() {
    Serial.begin(115200);
    unsigned long t0 = millis(); while (millis() - t0 < 300) yield();
    pinMode(PIN_DE, OUTPUT);
    digitalWrite(PIN_DE, LOW);
    Serial.println();
    Serial.println("=== EX518 IEC62056-21 Mode C TEST (WiFi/LoRa YO'Q) ===");
    Serial.printf("RS-485: RX=%d TX=%d DE=%d (A=klemma30 B=klemma31)\n",
                   (int)PIN_RX, (int)PIN_TX, (int)PIN_DE);
}

void loop() {
    Serial.println("\n--- Wake-up so'rovi: 300 baud, 7E1 ---");
    Serial2.end();
    unsigned long t = millis(); while (millis() - t < 50) yield();
    Serial2.begin(300, SERIAL_7E1, PIN_RX, PIN_TX);
    t = millis(); while (millis() - t < 50) yield();

    const char req[] = "/?!\r\n";
    de_tx();
    Serial2.write((const uint8_t*)req, strlen(req));
    Serial2.flush();
    de_rx();
    print_hex_ascii("TX", (const uint8_t*)req, strlen(req));

    uint8_t rx[128];
    size_t n = read_with_timeout(rx, sizeof(rx), 2000);
    if (n == 0) {
        Serial.println("XATO: identifikatsiya javobi kelmadi (2s kutildi)");
    } else {
        print_hex_ascii("RX (ID)", rx, n);
        if (n >= 6 && rx[0] == '/') {
            char baud_char = (char)rx[4];
            int idx = baud_char - '0';
            uint32_t new_baud = (idx >= 0 && idx < 7) ? BAUD_TABLE[idx] : 300;
            Serial.printf("Identifikatsiya: ishlab chiqaruvchi=%c%c%c baud_kod=%c -> %lu baud\n",
                          (char)rx[1], (char)rx[2], (char)rx[3], baud_char, (unsigned long)new_baud);

            char ack[8];
            int ack_len = snprintf(ack, sizeof(ack), "\x06""0%c0\r\n", baud_char);

            t = millis(); while (millis() - t < 300) yield();  // spec: 200-1500ms

            de_tx();
            Serial2.write((const uint8_t*)ack, ack_len);
            Serial2.flush();
            de_rx();
            print_hex_ascii("TX (ACK)", (const uint8_t*)ack, ack_len);

            t = millis(); while (millis() - t < 300) yield();
            Serial2.end();
            t = millis(); while (millis() - t < 50) yield();
            Serial2.begin(new_baud, SERIAL_7E1, PIN_RX, PIN_TX);

            size_t n2 = read_with_timeout(rx, sizeof(rx), 3000);
            if (n2 == 0) {
                Serial.println("XATO: ma'lumot bloki kelmadi (yangi baud'da)");
            } else {
                print_hex_ascii("RX (DATA)", rx, n2);
                Serial.println("--- ASCII matn ---");
                for (size_t i = 0; i < n2; i++) {
                    char c = (char)rx[i];
                    Serial.print(c == '\r' ? '\n' : ((c >= 32 && c < 127) ? c : '.'));
                }
                Serial.println();
            }
        } else {
            Serial.println("XATO: kutilmagan identifikatsiya formati");
        }
    }

    t = millis(); while (millis() - t < 5000) yield();
}

// ADS1115 INDUSTRIAL PRESSURE MONITOR
// Apparat:
//   ESP32 + ADS1115 (I2C 0x48, SDA=21, SCL=22)
//   HY-131 bosim uzatgich: 0–0.6 MPa, 4–20 mA
//   Shunt rezistor: 165 Ω  →  0.66 V (4mA) .. 3.30 V (20mA)
//   ADS1115 GAIN_ONE: ±4.096 V, 1 bit = 0.125 mV
//
// Kanallar:
//   A0 = Suv bosimi (HY-131, 0–0.6 MPa)
//   A1 = (kelajak) Gaz bosimi (0–16 mbar)
#elif defined(ADS1115_TEST)

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>

// ─── Apparat konfiguratsiya ─────────────────────────────────────────────────
#define ADS_SDA         21
#define ADS_SCL         22
#define ADS_ADDR        0x48
#define SHUNT_OHM       165.0f    // Shunt rezistor (Ω)
#define MV_PER_BIT      0.125f    // GAIN_ONE: 4.096V / 32768

// ─── Sensor chegaralari ─────────────────────────────────────────────────────
#define SENSOR_MA_MIN    4.0f     // 4 mA = 0 bosim
#define SENSOR_MA_MAX   20.0f     // 20 mA = max bosim
#define SENSOR_ERR_LO    3.6f     // < 3.6 mA = sim uzilgan / sensor xato
#define SENSOR_ERR_HI   21.0f     // > 21 mA = qisqa tutashuv

// ─── Bosim oralig'i ─────────────────────────────────────────────────────────
#define PRESSURE_MPA_MAX  0.6f    // HY-131: 0–0.6 MPa
#define MPA_TO_BAR       10.0f
#define MPA_TO_KPA     1000.0f
#define MPA_TO_PSI      145.038f
#define MPA_TO_M_H2O    101.972f  // metr suv ustuni

// ─── EMA filtri ─────────────────────────────────────────────────────────────
#define EMA_ALPHA        0.15f    // Eksponensial o'rtacha — silliqlashtirish

// ─── O'qish parametrlari ────────────────────────────────────────────────────
#define ADC_OVERSAMPLE    16      // Hardware oversample soni
#define READ_INTERVAL_MS 1000     // O'qish davri (ms)

// ─── Kanal holati ───────────────────────────────────────────────────────────
struct ChannelState {
    uint8_t  channel;       // ADS1115 kanal (0–3)
    const char* name;       // "WATER", "GAS", ...
    float    mpa_max;       // Sensor max bosim (MPa)
    float    ema_mA;        // EMA filtrdan o'tgan tok (mA)
    float    ema_mpa;       // EMA filtrdan o'tgan bosim (MPa)
    bool     initialized;   // Birinchi o'qish bo'ldimi
    bool     error;         // Sensor xatosi
    uint32_t err_count;     // Ketma-ket xatolar soni
    uint32_t read_count;    // Jami o'qishlar
};

// ─── Global ─────────────────────────────────────────────────────────────────
Adafruit_ADS1115 ads;
ChannelState ch_water = { 0, "WATER", PRESSURE_MPA_MAX, 0, 0, false, false, 0, 0 };

// Yordamchi funksiyalar

/** ADC dan o'rtacha voltaj o'qish (V) */
float readVoltage(uint8_t channel) {
    int32_t sum = 0;
    for (int i = 0; i < ADC_OVERSAMPLE; i++) {
        sum += ads.readADC_SingleEnded(channel);
        delayMicroseconds(500);
    }
    float raw_avg = (float)sum / ADC_OVERSAMPLE;
    return raw_avg * MV_PER_BIT / 1000.0f;   // mV → V
}

/** Voltajdan tok hisoblash (mA).  I = V / R × 1000 */
float readCurrent(float voltage_V) {
    return (voltage_V / SHUNT_OHM) * 1000.0f;
}

/** Tokdan bosim hisoblash (MPa).  4–20 mA → 0–max MPa */
float readPressure(float current_mA, float mpa_max) {
    if (current_mA < SENSOR_MA_MIN) return 0.0f;
    float mpa = (current_mA - SENSOR_MA_MIN) / (SENSOR_MA_MAX - SENSOR_MA_MIN) * mpa_max;
    return constrain(mpa, 0.0f, mpa_max);
}

/** EMA filtr yordamida yangilash */
void updateEMA(ChannelState& ch, float current_mA, float pressure_mpa) {
    if (!ch.initialized) {
        ch.ema_mA  = current_mA;
        ch.ema_mpa = pressure_mpa;
        ch.initialized = true;
    } else {
        ch.ema_mA  = EMA_ALPHA * current_mA  + (1.0f - EMA_ALPHA) * ch.ema_mA;
        ch.ema_mpa = EMA_ALPHA * pressure_mpa + (1.0f - EMA_ALPHA) * ch.ema_mpa;
    }
}

/** Sensor xatosini tekshirish */
bool checkSensorError(ChannelState& ch, float current_mA) {
    if (current_mA < SENSOR_ERR_LO || current_mA > SENSOR_ERR_HI) {
        ch.error = true;
        ch.err_count++;
        return true;
    }
    ch.error = false;
    ch.err_count = 0;
    return false;
}

/** Natijani serial ga chiqarish */
void printData(const ChannelState& ch, float voltage_V, float current_mA, float mpa_raw) {
    if (ch.error) {
        Serial.printf("[%s] XATO! Tok: %.2f mA ", ch.name, current_mA);
        if (current_mA < SENSOR_ERR_LO)
            Serial.printf("(< %.1f mA — sim uzilgan yoki sensor yo'q)\n", SENSOR_ERR_LO);
        else
            Serial.printf("(> %.1f mA — qisqa tutashuv)\n", SENSOR_ERR_HI);
        return;
    }

    Serial.printf("[%s] V=%.4f  I=%.2f mA  |  "
                  "Raw: %.4f MPa (%.2f bar)  |  "
                  "EMA: %.4f MPa (%.2f bar)  %.1f kPa  %.1f m.s.u.\n",
                  ch.name,
                  voltage_V,
                  current_mA,
                  mpa_raw,
                  mpa_raw * MPA_TO_BAR,
                  ch.ema_mpa,
                  ch.ema_mpa * MPA_TO_BAR,
                  ch.ema_mpa * MPA_TO_KPA,
                  ch.ema_mpa * MPA_TO_M_H2O);
}

/** Bitta kanalni to'liq o'qish + filtr + chiqarish */
void processChannel(ChannelState& ch) {
    ch.read_count++;
    float voltage = readVoltage(ch.channel);
    float current = readCurrent(voltage);

    bool err = checkSensorError(ch, current);
    float pressure = err ? 0.0f : readPressure(current, ch.mpa_max);
    if (!err) updateEMA(ch, current, pressure);

    printData(ch, voltage, current, pressure);
}

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("╔══════════════════════════════════════════════════════════╗");
    Serial.println("║  ADS1115 + HY-131 Industrial Pressure Monitor v2.0     ║");
    Serial.println("╠══════════════════════════════════════════════════════════╣");
    Serial.printf( "║  Shunt: %d Ω  |  Range: 0–%.1f MPa (0–%.0f bar)       ║\n",
                   (int)SHUNT_OHM, PRESSURE_MPA_MAX, PRESSURE_MPA_MAX * MPA_TO_BAR);
    Serial.printf( "║  ADC: GAIN_ONE (±4.096V)  |  %.3f mV/bit              ║\n", MV_PER_BIT);
    Serial.printf( "║  EMA α=%.2f  |  Oversample: %dx  |  Interval: %dms    ║\n",
                   EMA_ALPHA, ADC_OVERSAMPLE, READ_INTERVAL_MS);
    Serial.println("╚══════════════════════════════════════════════════════════╝");
    Serial.println();

    Wire.begin(ADS_SDA, ADS_SCL);
    if (!ads.begin(ADS_ADDR)) {
        Serial.println("XATO: ADS1115 topilmadi (0x48)! Ulanishni tekshiring:");
        Serial.println("  SDA → GPIO21,  SCL → GPIO22,  VDD → 3.3V,  GND → GND");
        while (true) { delay(1000); }
    }
    ads.setGain(GAIN_ONE);
    ads.setDataRate(RATE_ADS1115_128SPS);

    Serial.println("ADS1115 tayyor ✓");
    Serial.printf("Tokni kutish:  %.1f–%.1f mA (normal),  "
                  "< %.1f mA (xato),  > %.1f mA (xato)\n\n",
                  SENSOR_MA_MIN, SENSOR_MA_MAX, SENSOR_ERR_LO, SENSOR_ERR_HI);
}

// ═════════════════════════════════════════════════════════════════════════════
// Loop
// ═════════════════════════════════════════════════════════════════════════════
static unsigned long last_ms = 0;

void loop() {
    unsigned long now = millis();
    if (now - last_ms < READ_INTERVAL_MS && last_ms != 0) return;
    last_ms = now;

    processChannel(ch_water);
}

#elif defined(RS485_SELFTEST)
// RS-485 SELF-TEST — bitta ESP32 bilan rs485_bus.h freym protokolini sinash.
// Har 1.5s da raqamli test freymi yuboradi, keyin o'sha freymni qabul
// qilishga urinadi va natijani Serial'ga chiqaradi. WiFi/sensor YO'Q.
//
// Ulanish (2 variant):
//   A) TEZ (protokol/firmware testi) — modulni CHETLAB O'TIB, GPIO33 (TX) ni
//      to'g'ridan-to'g'ri GPIO32 (RX) ga jumper bilan ulang. Freym qaytib
//      keladi → protokol 100% ishlaydi.
//   B) MODUL bilan (haqiqiy) — MAX485 da RE(pin2) ni GND ga uling (qabul doim
//      yoniq), DE(pin3) ni GPIO25 ga. A/B tashqi ulanish shart emas (modul o'z
//      A/B sini o'zi eshitadi). Shunda modul orqali echo bo'ladi.
#include <Arduino.h>
#include "core/log.h"
#include "rs485_bus.h"

void setup() {
    Serial.begin(115200);
    unsigned long _t = millis(); while (millis() - _t < 300) yield();
    rs485_init();
    LOG_PRINTLN();
    LOG_PRINTLN("=== RS-485 SELF-TEST ===");
    LOG_PRINTF("Bus: RX=%d TX=%d DE=%d @%lu baud\n",
               RS485_BUS_RX, RS485_BUS_TX, RS485_BUS_DE, (unsigned long)RS485_BAUD);
    LOG_PRINTLN("Har 1.5s da freym yuboriladi va qaytishi tekshiriladi.\n");
}

void loop() {
    static uint32_t counter = 0;
    char msg[48];
    int len = snprintf(msg, sizeof(msg), "{\"test\":%lu,\"hello\":\"A1TECH\"}",
                       (unsigned long)counter++);

    LOG_PRINTF("TX -> %s\n", msg);
    rs485_send_frame((const uint8_t*)msg, (uint16_t)len);

    // Yuborilgan freymni qaytishini kutamiz (loopback)
    uint8_t rx[64];
    uint16_t n = rs485_recv_frame(rx, sizeof(rx) - 1, 500);
    if (n > 0) {
        rx[n] = '\0';
        bool ok = (n == (uint16_t)len && memcmp(rx, msg, len) == 0);
        LOG_PRINTF("RX <- (%d bayt) %s  [%s]\n", (int)n, (const char*)rx,
                   ok ? "MOS ✓" : "FARQLI ✗");
    } else {
        LOG_PRINTLN("RX <- (qaytmadi — loopback/ulanishni tekshiring)");
    }
    LOG_PRINTLN("");

    unsigned long t = millis(); while (millis() - t < 1500) yield();
}

#elif defined(RS485_MASTER_TEST)
// RS-485 MASTER TEST — bridge o'rnida, LEKIN meter/WiFi/server YO'Q. Faqat
// shinaga DISCOVER + adresli POLL yuborib, leaf javoblarini Serial'ga chiqaradi.
// 2 ta ESP32 (biri shu master, biri RS485_LEAF) A-A/B-B ulanganda shinada
// ma'lumot almashinuvini isbotlaydi. Bus pinlarini env'da override qilish mumkin
// (masalan master moduli 16/17/4 da bo'lsa).
#include <Arduino.h>
#include <ArduinoJson.h>
#include <string.h>
#include "core/log.h"
#include "rs485_bus.h"
#ifdef HAVE_LCD
  #include "display/lcd.h"
#endif

void setup() {
    Serial.begin(115200);
    unsigned long _t = millis(); while (millis() - _t < 300) yield();
    rs485_init();
#ifdef HAVE_LCD
    lcd_init();
    lcd_row(0, "RS485 Master");
    lcd_row(1, "Leaf kutilmoqda");
#endif
    LOG_PRINTLN();
    LOG_PRINTLN("=== RS-485 MASTER TEST ===");
    LOG_PRINTF("Bus: RX=%d TX=%d DE=%d @%lu baud\n",
               RS485_BUS_RX, RS485_BUS_TX, RS485_BUS_DE, (unsigned long)RS485_BAUD);
    LOG_PRINTLN("DISCOVER + adresli POLL. Leaf javoblari kutilmoqda...\n");
}

static char m_roster[8][13];
static int  m_roster_n = 0;

static bool m_extract_id(const char* json, char* out) {
    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, json)) return false;
    const char* id = doc["device_id"];
    if (!id || strlen(id) != 12) return false;
    strncpy(out, id, 13); out[12] = '\0';
    return true;
}

#ifdef HAVE_LCD
// Kelgan o'qishni LCD'da ko'rsatadi (iot/'dagi kabi — 0-qatorda qiymat,
// 1-qatorda "A1TECH  BRR"). utility_type'ga qarab formatlaydi.
static void m_lcd_show(const char* json) {
    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, json)) return;
    const char* ut = doc["utility_type"] | "";
    char row0[LCD_COLS + 1];

    if (!strcmp(ut, "electricity")) {
        float v = doc["voltage_l1"] | 0.0f;
        float a = doc["current_l1"] | 0.0f;
        int   w = doc["power_w"]    | 0;
        snprintf(row0, sizeof(row0), "%.0fV %.2fA %dW", v, a, w);
    } else if (!strcmp(ut, "soil")) {
        float h = doc["humidity"] | 0.0f;
        snprintf(row0, sizeof(row0), "Namlik: %.0f %%", h);
    } else if (!strcmp(ut, "water")) {
        float p = doc["pressure_bottom_bar"] | 0.0f;
        snprintf(row0, sizeof(row0), "Suv: %.2f bar", p);
    } else if (!strcmp(ut, "gas")) {
        float p = doc["pressure_bar"] | 0.0f;
        snprintf(row0, sizeof(row0), "Gaz: %.2f bar", p);
    } else if (!strcmp(ut, "sound")) {
        float l = doc["level"] | 0.0f;
        snprintf(row0, sizeof(row0), "Ovoz: %.0f %%", l);
    } else if (!strcmp(ut, "heating")) {
        float ti = doc["temperature_in_c"]  | 0.0f;
        float to = doc["temperature_out_c"] | 0.0f;
        snprintf(row0, sizeof(row0), "K:%.0f Ch:%.0f", ti, to);
    } else {
        snprintf(row0, sizeof(row0), "%-16s", ut);
    }
    lcd_row(0, row0);
    lcd_row(1, "A1TECH  BRR");
}
#endif

void loop() {
    // 1) DISCOVER — yangi leaflarni topamiz
    uint8_t cmd = RS485_CMD_DISCOVER;
    rs485_send_frame(&cmd, 1);
    LOG_PRINTLN("→ DISCOVER yuborildi");

    unsigned long win = millis();
    while (millis() - win < 1200) {
        uint8_t buf[RS485_MAX_FRAME + 1];
        uint16_t n = rs485_recv_frame(buf, RS485_MAX_FRAME, 300);
        if (n == 0) continue;
        buf[n] = '\0';
        char id[13];
        if (m_extract_id((const char*)buf, id)) {
            LOG_PRINTF("  ← javob: %s\n", (const char*)buf);
#ifdef HAVE_LCD
            m_lcd_show((const char*)buf);
#endif
            bool bor = false;
            for (int i = 0; i < m_roster_n; i++) if (!strcmp(m_roster[i], id)) bor = true;
            if (!bor && m_roster_n < 8) { strncpy(m_roster[m_roster_n++], id, 13);
                LOG_PRINTF("  + ro'yxatga qo'shildi: %s (jami %d)\n", id, m_roster_n); }
        } else {
            LOG_PRINTF("  ← yaroqsiz (%d bayt) MATN: [%s]\n", (int)n, (const char*)buf);
            LOG_PRINT("     HEX:");
            for (uint16_t _i = 0; _i < n && _i < 40; _i++) LOG_PRINTF(" %02X", buf[_i]);
            LOG_PRINTLN("");
        }
    }

    // 2) Adresli POLL — har leafni navbat bilan so'raymiz
    for (int i = 0; i < m_roster_n; i++) {
        uint8_t p[13]; p[0] = RS485_CMD_POLL; memcpy(p + 1, m_roster[i], 12);
        rs485_send_frame(p, 13);
        LOG_PRINTF("→ POLL %s\n", m_roster[i]);
        unsigned long w = millis(); bool got = false;
        while (millis() - w < 350) {
            uint8_t buf[RS485_MAX_FRAME + 1];
            uint16_t n = rs485_recv_frame(buf, RS485_MAX_FRAME, 300);
            if (n == 0) continue;
            buf[n] = '\0';
            LOG_PRINTF("  ← %s\n", (const char*)buf);
#ifdef HAVE_LCD
            m_lcd_show((const char*)buf);
#endif
            got = true; break;
        }
        if (!got) LOG_PRINTF("  ← (javob yo'q — %s)\n", m_roster[i]);
    }

    LOG_PRINTF("Sikl tugadi — %d leaf ma'lum.\n\n", m_roster_n);
    unsigned long t = millis(); while (millis() - t < 3000) yield();
}

#elif defined(RS485_DISPLAY)
// RS-485 SUV DISPLEY — shinani PASSIV tinglaydi (poll qilmaydi, UZATMAYDI),
// suv leaf javoblaridan bosimni olib LCD'ga chiqaradi. WiFi/sensor YO'Q.
// Ulanish: RO->32, DI->33, DE(+RE)->25 (DE doim LOW = qabul), LCD I2C SDA=21 SCL=22.
#include <Arduino.h>
#include <ArduinoJson.h>
#include "core/log.h"
#include "rs485_bus.h"
#include "display/lcd.h"

static unsigned long g_last_water_ms = 0;

void setup() {
    Serial.begin(115200);
    unsigned long _t = millis(); while (millis() - _t < 300) yield();
    rs485_init();                 // DE LOW = doim qabul (passiv tinglash, hech qачон uzatmaydi)
    lcd_init();
    lcd_row(0, "Suv kutilmoqda");
    lcd_row(1, "A1TECH  BRR");
    LOG_PRINTLN();
    LOG_PRINTLN("=== RS-485 SUV DISPLEY ===");
    LOG_PRINTF("Bus: RX=%d TX=%d DE=%d @%lu | LCD SDA=%d SCL=%d\n",
               RS485_BUS_RX, RS485_BUS_TX, RS485_BUS_DE, (unsigned long)RS485_BAUD,
               (int)LCD_SDA, (int)LCD_SCL);
    LOG_PRINTLN("Shina tinglanmoqda — suv leaf javobini kutamiz...\n");
}

void loop() {
    uint8_t buf[RS485_MAX_FRAME + 1];
    uint16_t n = rs485_recv_frame(buf, RS485_MAX_FRAME, 500);
    if (n > 0) {
        buf[n] = '\0';
        // Faqat JSON (leaf javobi) — komanda baytlarini (F1/F2) e'tiborsiz qoldiramiz
        StaticJsonDocument<512> doc;
        if (deserializeJson(doc, (const char*)buf) == DeserializationError::Ok) {
            const char* ut = doc["utility_type"] | "";
            if (!strcmp(ut, "water")) {
                float p = doc["pressure_bottom_bar"] | 0.0f;
                char r0[LCD_COLS + 1];
                snprintf(r0, sizeof(r0), "Suv: %.2f bar", p);
                lcd_row(0, r0);
                lcd_row(1, "A1TECH  BRR");   // 2-qator — boshqa qurilmalar kabi
                g_last_water_ms = millis();
                LOG_PRINTF("SUV: %.2f bar\n", p);
            }
        }
    }
    // Uzoq vaqt (60s) suv kelmasa — 0-qatorda ogohlantirish (2-qator A1TECH BRR qoladi)
    if (g_last_water_ms != 0 && millis() - g_last_water_ms > 60000UL) {
        lcd_row(0, "Suv: malumot yo'q");
    }
    lcd_refresh_if_needed();
}

#elif defined(RS485_LEAF)
// RS-485 LEAF MODE — bino ichidagi "ahmoq" sensor kontrolleri, WiFi yo'q.
// Ma'lumotni RS-485 shinasiga JSON sifatida chiqaradi, bridge (RS485_BRIDGE,
// oddiy WiFi rejimida) uni so'rab oladi va backend'ga HTTP orqali uzatadi.
#include "rs485_leaf.h"

#else
// NORMAL FIRMWARE MODE
#include "common.h"

// ─── Sensor ──────────────────────────────────────────────────────────────────
#ifdef SENSOR_ELECTRICITY
  #include "sensors/electricity.h"
#elif defined(SENSOR_WATER)
  #include "sensors/water.h"
#elif defined(SENSOR_GAS)
  #include "sensors/gas.h"
#elif defined(SENSOR_SOIL)
  #include "sensors/soil.h"
#elif defined(SENSOR_SOUND)
  #include "sensors/sound.h"
#elif defined(SENSOR_HEATING)
  #include "sensors/heating.h"
#else
  #error "Sensor flag kerak: -DSENSOR_ELECTRICITY | _WATER | _GAS | _SOIL | _SOUND | _HEATING"
#endif

// ─── Display ─────────────────────────────────────────────────────────────────
#if defined(HAVE_LCD) && defined(SENSOR_SOIL)
  #include "display/disp_soil.h"
#elif defined(HAVE_LCD) && defined(SENSOR_SOUND)
  #include "display/disp_sound.h"
#elif defined(HAVE_LCD) && defined(SENSOR_HEATING)
  #include "display/disp_heating.h"
#elif defined(HAVE_LCD) && defined(SENSOR_ELECTRICITY)
  #include "display/disp_elec.h"
#else
  #include "display/disp_none.h"
#endif

// ─── Konstantalar ────────────────────────────────────────────────────────────
// Sozlash portali AP nomi/paroli — build flag bilan almashtirish mumkin:
//   '-DWIFI_AP_NAME="MeningAP"' '-DWIFI_AP_PASS="parol123"'
#ifndef WIFI_AP_NAME
  #define WIFI_AP_NAME   "Bakhromdev"
#endif
#ifndef WIFI_AP_PASS
  #define WIFI_AP_PASS   "998935580311"
#endif
#ifndef READ_INTERVAL_MS
  #define READ_INTERVAL_MS  30000UL
#endif
#define CMD_POLL_MS       60000UL
#define HEALTH_CHECK_MS   60000UL
#define OFFLINE_BUF_SIZE  50

// ─── App state ───────────────────────────────────────────────────────────────
static char  device_id[20] = "";
static bool  registered    = false;
static bool  server_ok     = false;
static bool  prev_wifi_ok  = false;

static unsigned long last_read_ms   = 0;
static unsigned long last_cmd_ms    = 0;
static unsigned long last_health_ms = 0;
#ifdef SENSOR_SOUND
static unsigned long last_sound_lcd_ms = 0;
#define SOUND_LCD_MS  200UL   // Sound LCD har 200ms yangilansin
#endif

#ifdef SENSOR_ELECTRICITY
static int           meter_fail_count = 0;
static unsigned long meter_retry_ms   = 30000UL;
#define METER_RETRY_MAX_MS  300000UL
static bool g_lora_ok = false;

static void lora_check() {
    if (WiFi.status() != WL_CONNECTED) return;
    String resp = http_get("/api/public/lora-status");
    if (resp.isEmpty()) { g_lora_ok = false; return; }
    StaticJsonDocument<64> doc;
    if (deserializeJson(doc, resp)) { g_lora_ok = false; return; }
    g_lora_ok = doc["online"] | false;
}
#endif

// ─── Offline buffer ──────────────────────────────────────────────────────────
static String off_buf[OFFLINE_BUF_SIZE];
static int    off_head  = 0;
static int    off_count = 0;

// Minimum heap — bufer yozishni to'xtatish chegarasi (16KB qoldirish)
#define MIN_HEAP_BYTES  16384

static void buf_push(const String& json) {
    // Heap himoyasi: juda kam joy qolsa, eski yozuvlarni tozalash
    if (ESP.getFreeHeap() < MIN_HEAP_BYTES) {
        LOG_PRINTF("HEAP OGOHLANTIRISH: %d bayt qoldi — bufer tozalanadi\n",
                   (int)ESP.getFreeHeap());
        for (int i = 0; i < OFFLINE_BUF_SIZE; i++) off_buf[i] = "";
        off_head = 0;
        off_count = 0;
        return;
    }
    off_buf[off_head] = json;
    off_head = (off_head + 1) % OFFLINE_BUF_SIZE;
    if (off_count < OFFLINE_BUF_SIZE) off_count++;
}

static void buf_flush() {
    if (off_count == 0 || !server_ok) return;
    int start = (off_head - off_count + OFFLINE_BUF_SIZE) % OFFLINE_BUF_SIZE;
    int sent = 0;
    for (int i = 0; i < off_count; i++) {
        int idx = (start + i) % OFFLINE_BUF_SIZE;
        if (!http_post("/api/readings", off_buf[idx])) break;
        off_buf[idx] = "";  // RAM ni bo'shatish
        sent++;
    }
    off_count -= sent;
    if (off_count < 0) off_count = 0;
}

static bool do_register() {
    return sensor_do_register(device_id, FW_VERSION);
}

// Bino ichidagi RS-485 leaf sensorlarni so'rab, backend'ga forward qiluvchi
// qo'shimcha — buf_push()/server_ok/diag_timestamp() e'lon qilingandan
// KEYIN include qilinishi shart.
#ifdef RS485_BRIDGE
  #include "rs485_bridge.h"
#endif

void setup() {
#if CORE_DEBUG_LEVEL > 0 || defined(APP_DEBUG)
    Serial.begin(115200);
    unsigned long _t = millis(); while (millis() - _t < 200) yield();
#endif

    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(device_id, sizeof(device_id), "%02X%02X%02X%02X%02X%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    LOG_PRINTLN();
    LOG_PRINTLN("╔══════════════════════════════════════════╗");
    LOG_PRINTLN("║       Meter Monitor v" FW_VERSION "            ║");
    LOG_PRINTLN("╚══════════════════════════════════════════╝");
    LOG_PRINTF("ID: %s\n", device_id);

    cfg_load();
    nvs_health_check();

    // BOOT tugmasi (GPIO0) 3s → WiFi reset
    pinMode(0, INPUT_PULLUP);
    if (digitalRead(0) == LOW) {
        unsigned long t = millis();
        while (millis() - t < 3000 && digitalRead(0) == LOW) yield();
        if (digitalRead(0) == LOW) {
            WiFiManager wm;
            wm.resetSettings();
            ESP.restart();
        }
    }

    // LCD: WiFi dan OLDIN — WiFi sozlash portali ekranda ko'rinsin uchun
#ifdef SENSOR_ELECTRICITY
    elec_lcd_init();   // elektr/bridge LCD (idempotent) — portal xabari uchun
#else
    disp_init();
#endif

    // WiFi
#ifndef DEFAULT_WIFI_SSID
  #define DEFAULT_WIFI_SSID ""
#endif
#ifndef DEFAULT_WIFI_PASS
  #define DEFAULT_WIFI_PASS ""
#endif
    {
        bool wifi_ok = wifi_connect_boot(DEFAULT_WIFI_SSID, DEFAULT_WIFI_PASS);
        if (!wifi_ok) {
#if defined(HAVE_LCD) && defined(SENSOR_ELECTRICITY)
            // Elektr/bridge LCD (elec_lcd_row) — foydalanuvchi AP nomini ko'rsin
            elec_lcd_row(0, "WiFi Sozlash:");
            elec_lcd_row(1, WIFI_AP_NAME);
#elif defined(HAVE_LCD)
            lcd_row(0, "WiFi AP Portal");
            lcd_row(1, WIFI_AP_NAME);
#endif
            LOG_PRINTF("WiFi: Ulanish bo'lmadi — AP '%s' Sozlash Portali ochilmoqda...\n", WIFI_AP_NAME);
            wifi_portal(WIFI_AP_NAME, WIFI_AP_PASS, device_id, g_cfg.meter_serial);
        }
    }

    // NTP vaqt sinxronlash (WiFi ulangandan keyin)
    if (WiFi.status() == WL_CONNECTED) ntp_init();

#ifndef RS485_BRIDGE
    server_ok = server_check();
#endif

    // ── Sensor ───────────────────────────────────────────────────────────────
#if defined(RS485_BRIDGE)
    // Sof COLLECTOR — o'z meterini o'qimaydi (leaf'lardan yig'adi). sensor_init
    // faqat LCD/Serial2 sozlaydi, sekin DLMS ulanish urinishlari YO'Q (aks holda
    // "Yuklanmoqda"da 10-15s qotib turardi).
    sensor_init();
  #if defined(HAVE_LCD)
    elec_lcd_row(0, "");
    elec_lcd_row(1, "A1TECH  BRR");
  #endif
#elif defined(SENSOR_ELECTRICITY)
    sensor_init();
    wifi_pause();

    bool meter_found = false;
    for (int attempt = 1; attempt <= 3; attempt++) {
        if (sensor_connect()) {
            dlms_get_string(1, OBIS_SERIAL, 2,
                            g_sensor_meta.meter_serial,
                            sizeof(g_sensor_meta.meter_serial));
            sensor_detect_type();
            cfg_save_meter_serial(g_sensor_meta.meter_serial);
            meter_found = true;
            break;
        }
        unsigned long t = millis(); while (millis() - t < 500) yield();
    }

    wifi_resume();
#else
    sensor_init();
#endif

#ifdef RS485_BRIDGE
    // Collector — setup'da server_check YO'Q (TLS ~4s kutmaymiz). loop birinchi
    // iteratsiyada darhol tekshiradi; LCD esa poll'dan keyin darhol data ko'rsatadi.
#else
    server_ok = server_check();
    if (server_ok) {
        registered = do_register();
        buf_flush();
    }
#endif
#if defined(SENSOR_ELECTRICITY) && !defined(RS485_BRIDGE)
    if (server_ok) lora_check();
    disp_show_status(WiFi.status() == WL_CONNECTED, server_ok, g_lora_ok);
#endif

#ifdef RS485_BRIDGE
    rs485_bridge_init();
#endif

    // Watchdog (OTA butunlay olib tashlandi)
    wdt_init();

    LOG_PRINTLN("Tayyor!\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loop — blokirovkasiz
// ═══════════════════════════════════════════════════════════════════════════════
void loop() {
    unsigned long now = millis();
    wdt_feed();

    // WiFi uzilish aniqlash
    bool wifi_now = (WiFi.status() == WL_CONNECTED);
    if (prev_wifi_ok && !wifi_now) {
        g_diag_wifi_drops++;
        diag_error("WiFi uzildi");
    }
    prev_wifi_ok = wifi_now;

    // WiFi: non-blocking qayta ulanish
    wifi_loop();

#ifdef RS485_BRIDGE
    // Bino ichidagi RS-485 leaf sensorlarni so'rash — o'zining vaqt
    // taymeri bilan cheklangan, elektr hisoblagich o'qish holatidan mustaqil.
    rs485_bridge_poll_cycle();
#endif

    // Sound LCD: har 200ms real-time yangilash
#ifdef SENSOR_SOUND
    if (now - last_sound_lcd_ms >= SOUND_LCD_MS) {
        last_sound_lcd_ms = now;
        SensorData _ld;
        if (sensor_read(_ld)) disp_show_reading(_ld);
    }
#endif

    // Sensor o'qish vaqti tekshirish
#if defined(RS485_BRIDGE)
    // Sof collector — o'z sensori/meterini o'qimaydi, faqat leaf'lardan yig'adi.
    bool meter_time = false;
#elif defined(SENSOR_ELECTRICITY)
    bool meter_time = (now - last_read_ms >= meter_retry_ms || last_read_ms == 0);
#else
    bool meter_time = (now - last_read_ms >= g_cfg.read_interval_ms || last_read_ms == 0);
#endif

    // Server health check (birinchi marta DARHOL, keyin har 60s) — faqat WiFi bor bo'lsa.
    // Birinchisi tez bo'lgani uchun collector setup'da TLS'ni kutmasdan ishga
    // tushadi, LCD data'ni darhol ko'rsatadi, server tekshiruvi fonda bo'ladi.
    if (!meter_time && WiFi.status() == WL_CONNECTED &&
        (last_health_ms == 0 || now - last_health_ms >= HEALTH_CHECK_MS)) {
        last_health_ms = now;
        bool prev = server_ok;
        server_ok = server_check();
        if (server_ok && !prev) {
            if (!registered) registered = do_register();
            buf_flush();
        }
    }

    // ── Sensor o'qish ────────────────────────────────────────────────────────
    if (meter_time) {
        last_read_ms = now;

#ifdef SENSOR_ELECTRICITY
        wifi_pause();

        if (!dlms_connected) {
            if (!sensor_connect()) {
                wifi_resume();
                meter_fail_count++;
                g_diag_sensor_errors++;
                diag_error("Meter ulanish xato");
                if (meter_fail_count >= 3)
                    meter_retry_ms = min(meter_retry_ms * 2, METER_RETRY_MAX_MS);
                return;
            }
            meter_fail_count = 0;
            // Backend set_interval bilan o'zgartirgan qiymat ishlatilsin
            // (READ_INTERVAL_MS compile-time default edi)
            meter_retry_ms   = g_cfg.read_interval_ms;
            if (!g_sensor_meta.meter_serial[0])
                dlms_get_string(1, OBIS_SERIAL, 2,
                                g_sensor_meta.meter_serial,
                                sizeof(g_sensor_meta.meter_serial));
            if (!g_sensor_meta.sensor_type[0])
                sensor_detect_type();
        }
#endif

        SensorData d;
        bool read_ok = sensor_read(d);

#ifdef SENSOR_ELECTRICITY
        bool wifi_ok = wifi_resume();
#else
        bool wifi_ok = (WiFi.status() == WL_CONNECTED);
#endif

        if (!read_ok) {
            g_diag_sensor_errors++;
#ifdef SENSOR_ELECTRICITY
            diag_error("Meter o'qish xato");
            dlms_disconnect();
#else
            diag_error("Sensor o'qish xato");
#endif
            return;
        }

        disp_show_reading(d);

        // Serverga yuborish — faqat POST, server_check periodic bo'ladi
        String json = sensor_build_json(device_id, FW_VERSION, d);

        // NTP timestamp qo'shish (offline bufer uchun muhim)
        // snprintf bilan — String concat heap fragmentatsiyasi yo'q
        char _ts[25];
        if (diag_timestamp(_ts, sizeof(_ts))) {
            int _lb = json.lastIndexOf('}');
            if (_lb > 0) {
                char _ts_frag[50];
                snprintf(_ts_frag, sizeof(_ts_frag), ",\"timestamp\":\"%s\"}", _ts);
                json = json.substring(0, _lb) + _ts_frag;
            }
        }

        if (wifi_ok && server_ok) {
            if (!registered) registered = do_register();
            if (!http_post("/api/readings", json)) {
                buf_push(json);
            }
        } else {
            buf_push(json);
        }

#ifdef SENSOR_ELECTRICITY
        disp_show_status(wifi_ok, server_ok, g_lora_ok);
#else
        disp_show_status(wifi_ok, server_ok, false);
#endif
    }

    // ── Periodic: health + flush + commands + OTA (har 60s) ──────────────
    if (WiFi.status() == WL_CONNECTED &&
        now - last_health_ms >= HEALTH_CHECK_MS) {
        last_health_ms = now;

        bool prev = server_ok;
        server_ok = server_check();

        if (server_ok) {
            if (!registered) registered = do_register();
            buf_flush();
#ifdef SENSOR_ELECTRICITY
            lora_check();
#endif
        }

        if (server_ok && !prev) {
            ota_check(device_id, FW_VERSION);
        }
    }

    // ── Command poll + status (har 60s, health dan alohida) ──────────────
    if (server_ok && WiFi.status() == WL_CONNECTED &&
        now - last_cmd_ms >= CMD_POLL_MS) {
        last_cmd_ms = now;
        app_poll_commands(device_id, FW_VERSION);
        app_send_status(device_id, FW_VERSION);
    }
}

#endif // ADS1115_TEST
