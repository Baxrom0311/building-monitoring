#pragma once
/**
 * rs485_bus.h — Bino ichidagi RS-485 shinasi uchun umumiy past darajali
 * freym yuborish/qabul qilish yordamchisi (leaf ham, bridge ham ishlatadi).
 *
 * DE-toggle vaqt namunasi sensors/dlms.h dagi isbotlangan (productionda DLMS
 * bilan ishlaydigan) ketma-ketlikdan olingan, lekin bu yerda DLMS/HDLC'ga
 * bog'liqlik yo'q — oddiy uzunlik-prefiksli freym.
 *
 * Freym format (simda): [len_lo(1)][len_hi(1)][payload(len bayt)]
 * (2-baytli uzunlik — JSON matn LoRa binary struct'dan uzunroq bo'lgani
 * uchun 1 baytli (255 max) chegara yetarli emas edi.)
 *
 *   - Bridge -> leaf: len=1, payload=[RS485_POLL_BYTE]  ("javob ber" broadcast)
 *   - Leaf -> bridge: len=JSON matn uzunligi, payload = sensor_build_json()
 *     natijasi (device_id/utility_type/sensor_type/o'lchovlar) — bridge buni
 *     faqat timestamp qo'shib, o'zgarishsiz /api/readings ga POST qiladi.
 *
 * UART: Serial1 (Serial0=USB log, Serial2=elektr hisoblagich DLMS — band).
 * Pinlar build_flag bilan almashtiriladi.
 */

#include <Arduino.h>

#ifndef RS485_BUS_RX
  #define RS485_BUS_RX  32
#endif
#ifndef RS485_BUS_TX
  #define RS485_BUS_TX  33
#endif
#ifndef RS485_BUS_DE
  #define RS485_BUS_DE  25
#endif
#ifndef RS485_BAUD
  #define RS485_BAUD    19200
#endif
#ifndef RS485_MAX_FRAME
  // electricity_rs485_leaf / building_bridge muhitlarida elektr hisoblagich
  // JSON'i ham AYNAN shu RS-485 shinasidan yuboriladi (Serial2 faqat DLMS
  // uchun band — natija shu Serial1 shinaga chiqadi). Hozircha elektr JSON'i
  // ~300-330 bayt (meter_serial 31 belgigacha bo'lishi mumkin), shuning uchun
  // kelajakda maydon qo'shilsa ham zaxira qolishi uchun 512 bayt qilib qo'yilgan.
  #define RS485_MAX_FRAME  512
#endif
// ─── Bridge -> leaf komanda baytlari ─────────────────────────────────────────
// Adresli poll (Modbus uslubi) — to'qnashuvni butunlay yo'qotadi:
//   DISCOVER (broadcast) — hamma leaf o'z ID sini qaytaradi (bridge ro'yxat
//     tuzadi). Faqat vaqti-vaqti bilan; bu yagona kollizion bo'lishi mumkin
//     bosqich, shuning uchun jitter + bir necha marta takrorlanadi.
//   POLL <id> — faqat ID si mos leaf javob beradi; bir vaqtda bittasi gapiradi.
#define RS485_CMD_DISCOVER  0xF1   // payload: [0xF1]
#define RS485_CMD_POLL      0xF2   // payload: [0xF2][id_str...]  (id — ASCII MAC)
#define RS485_POLL_BYTE     0xF0   // ESKI broadcast (moslik uchun qoldirildi)

static void rs485_init() {
    pinMode(RS485_BUS_DE, OUTPUT);
    digitalWrite(RS485_BUS_DE, LOW);
    Serial1.begin(RS485_BAUD, SERIAL_8N1, RS485_BUS_RX, RS485_BUS_TX);
}

static void rs485_send_frame(const uint8_t* buf, uint16_t len) {
    while (Serial1.available()) Serial1.read();
    digitalWrite(RS485_BUS_DE, HIGH);
    delayMicroseconds(200);
    Serial1.write((uint8_t)(len & 0xFF));
    Serial1.write((uint8_t)(len >> 8));
    Serial1.write(buf, len);
    Serial1.flush();
    delayMicroseconds(600);
    digitalWrite(RS485_BUS_DE, LOW);
    delayMicroseconds(300);
}

// timeout_ms ichida bitta freymni qabul qilishga urinadi. 0 = timeout/xato.
static uint16_t rs485_recv_frame(uint8_t* buf, uint16_t maxLen, uint32_t timeout_ms) {
    uint32_t t0 = millis();
    while (Serial1.available() < 2) {
        wdt_feed();
        if (millis() - t0 >= timeout_ms) {
            // Timeout: 1 ta yolg'iz bayt qolgan bo'lsa tozalaymiz — aks holda
            // keyingi chaqiruvда u len_lo sifatida o'qilib, freym hizalanишни
            // buzadi (audit: discover'да stray-byte desync).
            while (Serial1.available()) Serial1.read();
            return 0;
        }
        yield();
    }
    uint16_t len = (uint16_t)Serial1.read();
    len |= ((uint16_t)Serial1.read()) << 8;
    if (len == 0 || len > maxLen) {
        // Freym bu qurilma buferidan KATTA (masalan boshqa leaf'ning uzun JSON
        // javobi). Payload'ni SHINADAN O'QIB TASHLAYMIZ (skip).
        // Shovqin bo'lsa wdt_feed() va max_skip bilan cheklanadi — qotish/reboot xavfi yo'q.
        uint16_t skip = 0;
        uint16_t max_skip = maxLen > 512 ? maxLen : 512;
        uint32_t ts = millis();
        while (skip < len && skip < max_skip) {
            wdt_feed();
            if (Serial1.available()) { Serial1.read(); skip++; ts = millis(); }
            else if (millis() - ts >= 100) break;   // 100ms sukut bo'lsa darhol to'xtaymiz
            else yield();
        }
        return 0;
    }

    uint16_t got = 0;
    uint32_t t1 = millis();
    while (got < len) {
        wdt_feed();
        if (Serial1.available()) {
            buf[got++] = Serial1.read();
        } else if (millis() - t1 >= timeout_ms) {
            // Timeout: HEADER-kutish yo'lidagi kabi, kech kelayotgan
            // qoldiq baytlarni tozalaymiz — aks holda keyingi chaqiruv ularni
            // yangi freym header'i deb noto'g'ri talqin qilib, aslida
            // yaroqli bo'lgan retry javobini buzishi mumkin.
            while (Serial1.available()) Serial1.read();
            return 0;  // to'liq freym yetib kelmadi — kollizion/uzilish
        } else {
            yield();
        }
    }
    return len;
}
