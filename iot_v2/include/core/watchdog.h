#pragma once
/**
 * core/watchdog.h — ESP32 Task Watchdog Timer (TWDT)
 *
 * Qurilma osib qolsa (loop 30s javob bermasa) → avtomatik qayta ishga tushadi.
 *
 *   wdt_init()   — setup() oxirida chaqiring
 *   wdt_feed()   — loop() boshida chaqiring
 *   wdt_pause()  — OTA yoki uzoq operatsiya oldidan
 *   wdt_resume() — operatsiyadan keyin
 */

#include <esp_task_wdt.h>
#include "core/log.h"

#ifndef WDT_TIMEOUT_S
  #define WDT_TIMEOUT_S  30
#endif

static void wdt_init() {
    esp_task_wdt_init(WDT_TIMEOUT_S, true);   // true = panic → restart
    esp_task_wdt_add(NULL);                     // Hozirgi task (loopTask) ni kuzatish
    LOG_PRINTF("Watchdog: %ds timeout\n", WDT_TIMEOUT_S);
}

static void wdt_feed() {
    esp_task_wdt_reset();
}

static void wdt_pause() {
    esp_task_wdt_delete(NULL);
}

static void wdt_resume() {
    esp_task_wdt_add(NULL);
}
