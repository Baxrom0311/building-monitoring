#pragma once
/**
 * rs485_bridge.h — Bino ichidagi RS-485 leaf sensorlarni so'rab, ularning
 * JSON o'qishlarini backend'ga (HTTP, /api/readings) uzatuvchi qo'shimcha.
 *
 * Faqat -DRS485_BRIDGE bilan yoqiladi, oddiy WiFi "electricity" rejimiga
 * (SENSOR_ELECTRICITY, main.cpp "NORMAL FIRMWARE MODE") qo'shiladi. Elektr
 * hisoblagich DLMS logikasiga (Serial2, dlms.h) TEGILMAYDI — bu yangi shina
 * alohida UART (Serial1, rs485_bus.h) ishlatadi.
 *
 * Protokol: bridge har RS485_BRIDGE_POLL_MS da broadcast "poll" bayti
 * yuboradi, RS485_BRIDGE_WINDOW_MS davomida javob kutadi. Har bir kelgan
 * freym — leaf tomonidan sensor_build_json() bilan tayyorlangan JSON matn.
 * Bridge uni tekshiradi (yaroqli JSON'mi), o'z NTP vaqtini timestamp
 * sifatida qo'shadi, va mavjud http_post()/buf_push() (main.cpp'dagi oddiy
 * WiFi oqimi bilan bir xil offline-bufer) orqali yuboradi.
 *
 * Bu fayl main.cpp ichidan, buf_push()/server_ok/diag_timestamp() aniq-
 * langandan KEYIN include qilinishi shart — ularni to'g'ridan-to'g'ri
 * ishlatadi.
 */

#include "rs485_bus.h"

#ifndef RS485_BRIDGE_POLL_MS
  #define RS485_BRIDGE_POLL_MS     20000UL  // Bino ichini har necha ms da so'raydi
#endif
#define RS485_BRIDGE_WINDOW_MS     1500UL   // Bitta poll'dan keyin javob kutish oynasi
#define RS485_BRIDGE_MAX_REPLIES   16       // Bitta siklda qabul qilinadigan max javob

static unsigned long rs485_bridge_last_ms = 0;

static void rs485_bridge_init() {
    rs485_init();
    LOG_PRINTF("RS485 bridge: bino ichi RX=%d TX=%d DE=%d @%lu baud, har %lus so'raladi\n",
               RS485_BUS_RX, RS485_BUS_TX, RS485_BUS_DE, (unsigned long)RS485_BAUD,
               RS485_BRIDGE_POLL_MS / 1000);
}

// Bitta leaf'dan kelgan JSON'ga timestamp qo'shib, backend'ga yuboradi
// (yoki WiFi/server yo'q bo'lsa offline buferga saqlaydi) — main.cpp'dagi
// o'zining reading yuborish yo'li bilan bir xil mantiq.
static void rs485_bridge_forward(const char* json_in) {
    String json(json_in);
    char _ts[25];
    if (diag_timestamp(_ts, sizeof(_ts))) {
        int _lb = json.lastIndexOf('}');
        if (_lb > 0) {
            char _ts_frag[50];
            snprintf(_ts_frag, sizeof(_ts_frag), ",\"timestamp\":\"%s\"}", _ts);
            json = json.substring(0, _lb) + _ts_frag;
        }
    }
    if (WiFi.status() == WL_CONNECTED && server_ok) {
        if (!http_post("/api/readings", json)) buf_push(json);
    } else {
        buf_push(json);
    }
}

// Bitta poll+yig'ish+forward siklini bajaradi. O'z vaqt taymeri bilan
// cheklangan — chaqiruvchi buni har loop() iteratsiyasida chaqiraveradi,
// vaqt kelmaguncha darhol qaytadi.
static void rs485_bridge_poll_cycle() {
    unsigned long now = millis();
    if (rs485_bridge_last_ms != 0 && now - rs485_bridge_last_ms < RS485_BRIDGE_POLL_MS) return;
    rs485_bridge_last_ms = now;

    uint8_t poll = RS485_POLL_BYTE;
    rs485_send_frame(&poll, 1);
    LOG_PRINTLN("RS485 bridge: poll yuborildi, leaf javoblari kutilmoqda...");

    int replies = 0;
    unsigned long win_start = millis();
    while (millis() - win_start < RS485_BRIDGE_WINDOW_MS && replies < RS485_BRIDGE_MAX_REPLIES) {
        wdt_feed();
        uint8_t buf[RS485_MAX_FRAME + 1];
        uint16_t n = rs485_recv_frame(buf, RS485_MAX_FRAME, 150);
        if (n == 0) continue;
        buf[n] = '\0';

        // Yaroqlilik tekshiruvi — kollizion bo'lsa yarim/buzilgan matn kelishi
        // mumkin, JSON sifatida parse qilinmasa tashlab yuboriladi.
        StaticJsonDocument<32> probe;
        DeserializationError err = deserializeJson(probe, (const char*)buf,
                                                    DeserializationOption::NestingLimit(10));
        if (err && err != DeserializationError::NoMemory) {
            LOG_PRINTF("RS485 bridge: yaroqsiz JSON — tashlab yuborildi (%s)\n", err.c_str());
            continue;
        }

        LOG_PRINTF("RS485 bridge: leaf (%d bayt) -> %s\n", (int)n, (const char*)buf);

        // Bino bir nechta leaf'ni birma-bir yuborishda WiFi/serverni bir
        // zumda "portlatib" yubormaslik uchun kichik tanaffus.
        unsigned long d = random(100, 400);
        unsigned long t = millis(); while (millis() - t < d) { wdt_feed(); yield(); }

        rs485_bridge_forward((const char*)buf);
        replies++;
    }
    LOG_PRINTF("RS485 bridge: sikl tugadi, %d ta o'qish yuborildi\n", replies);
}
