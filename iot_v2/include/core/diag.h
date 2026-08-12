#pragma once
/**
 * core/diag.h — Diagnostika va NTP vaqt sinxronlash
 *
 * Xato hisoblagichlar + NTP timestamp
 * Backend ga /api/device-status orqali yuboriladi.
 */

#include <Arduino.h>
#include <time.h>
#include "esp_system.h"
#include "core/log.h"

// ─── Xato hisoblagichlar ──────────────────────────────────────────────────────
static uint16_t g_diag_sensor_errors = 0;
static uint16_t g_diag_wifi_drops    = 0;
static char     g_diag_last_error[64] = "";

static void diag_error(const char* msg) {
    strncpy(g_diag_last_error, msg, sizeof(g_diag_last_error) - 1);
    g_diag_last_error[sizeof(g_diag_last_error) - 1] = '\0';
    LOG_PRINTF("XATO: %s\n", msg);
}

// Qurilma NEGA qayta yuklanganini bir marta, setup() boshida log qiladi
// (quvvat yoqilishi / watchdog / brownout / panic / boshqa). Kelajakda
// dalada muammo diagnostikasi uchun (audit FIX E).
static void diag_log_reset_reason() {
    esp_reset_reason_t r = esp_reset_reason();
    const char* name;
    switch (r) {
        case ESP_RST_POWERON:  name = "POWERON (oddiy quvvat yoqilishi)";       break;
        case ESP_RST_TASK_WDT:
        case ESP_RST_WDT:
        case ESP_RST_INT_WDT:  name = "WATCHDOG (task/wdt reset)";             break;
        case ESP_RST_BROWNOUT: name = "BROWNOUT (kuchlanish tushib ketdi)";    break;
        case ESP_RST_PANIC:    name = "PANIC (software xatosi)";               break;
        default:                name = "BOSHQA";                               break;
    }
    LOG_PRINTF("Reboot sababi: %s (kod=%d)\n", name, (int)r);
}

// Lokal (Serial) heap trend logi — WiFi/server holatidan MUSTAQIL chaqiriladi,
// backend'ga /api/device-status orqali yuboriladigan heap_free'dan farqli
// o'laroq bu WiFi uzilgan/xotira sizib ketayotgan paytda ham ko'rinadi
// (audit FIX E).
static void diag_log_heap_trend() {
    LOG_PRINTF("Heap: %u bayt bo'sh\n", (unsigned)ESP.getFreeHeap());
}

// ─── NTP vaqt sinxronlash ─────────────────────────────────────────────────────
static void ntp_init() {
    configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC
    LOG_PRINTLN("NTP: sinxronlash boshlandi");
}

static bool ntp_valid() {
    return time(nullptr) > 1609459200;  // > 2021-01-01
}

// ISO 8601 UTC timestamp → "2025-01-15T14:30:00Z"
static bool diag_timestamp(char* buf, size_t len) {
    time_t now = time(nullptr);
    if (now < 1609459200) return false;
    struct tm* t = gmtime(&now);
    snprintf(buf, len, "%04d-%02d-%02dT%02d:%02d:%02dZ",
             t->tm_year + 1900, t->tm_mon + 1, t->tm_mday,
             t->tm_hour, t->tm_min, t->tm_sec);
    return true;
}
