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
#define RS485_BRIDGE_DISCOVER_MS    350UL   // DISCOVER'dan keyin javoblarni yig'ish oynasi (raund)
#define RS485_BRIDGE_DISCOVER_ROUNDS  2     // DISCOVER takrorlash soni (tezkor kashfiyot)
#ifndef RS485_BRIDGE_INTER_LEAF_GAP_MS
  #define RS485_BRIDGE_INTER_LEAF_GAP_MS  50UL    // Shina tanaffusi (MAX485 DE uzilishi va kabel sig'imi uchun 100% xavfsiz 50ms)
#endif
#define RS485_BRIDGE_REPLY_MS       350UL   // Adresli POLL'dan keyin bitta leaf javobini kutish
                                            // (rs485_recv_frame() ichki timeout'i 300ms — DISCOVER
                                            // oynasidagi kabi ~50ms zaxira bilan, aks holda ichki
                                            // chaqiruv har doim tashqi oynadan oshib ketardi)
#define RS485_BRIDGE_RETRY          1       // Adresli POLL javob kelmasa qayta so'rash soni
#define RS485_BRIDGE_MAX_LEAVES     16      // Ro'yxatdagi maksimal leaf soni
#define RS485_BRIDGE_MISS_WARN      30      // Shuncha ketma-ket miss'dan keyin "javob bermayapti" deb log qilinadi
                                            // (20s sikl × 30 ≈ 10 daqiqa — qisqa uzilishlarda shovqin qilmaydi)
#define RS485_BRIDGE_MAX_MISS       500     // FAQAT juda ko'p (soatlab) miss'dan keyin ro'yxatdan chiqariladi.
                                            // Odatda leaf ro'yxatda QOLADI — javob bermasa backend uni
                                            // (last_seen orqali) "offline/ishlamayapti" deb ko'rsatadi va
                                            // qurilma qaytsa avtomatik tiklanadi.
#define RS485_BRIDGE_DISCOVER_EVERY 1       // HAR siklda yangi leaf qidiriladi — ro'yxatdagi
                                            // leaf DISCOVER'da jim turadi (skip), shuning uchun
                                            // yangi leaf tez (1-2 sikl) va to'qnashuvsiz tushadi
#define RS485_LEAF_ID_LEN           12      // ASCII MAC uzunligi

static unsigned long rs485_bridge_last_ms = 0;

// ─── Leaf ro'yxati (avto-discovery bilan to'ldiriladi) ───────────────────────
static char    rs485_roster[RS485_BRIDGE_MAX_LEAVES][RS485_LEAF_ID_LEN + 1];
static uint8_t rs485_miss[RS485_BRIDGE_MAX_LEAVES];
static int     rs485_roster_n = 0;
static uint32_t rs485_cycle_no = 0;

static int rs485_roster_find(const char* id) {
    for (int i = 0; i < rs485_roster_n; i++)
        if (strncmp(rs485_roster[i], id, RS485_LEAF_ID_LEN + 1) == 0) return i;
    return -1;
}

static void rs485_roster_add(const char* id) {
    if (strlen(id) != RS485_LEAF_ID_LEN) return;      // faqat to'g'ri MAC uzunligi
    if (rs485_roster_find(id) >= 0) return;           // allaqachon bor
    if (rs485_roster_n >= RS485_BRIDGE_MAX_LEAVES) {
        LOG_PRINTF("RS485 bridge: ro'yxat TO'LIQ (%d/%d) — leaf %s rad etildi\n",
                   rs485_roster_n, RS485_BRIDGE_MAX_LEAVES, id);
        return;
    }
    strncpy(rs485_roster[rs485_roster_n], id, RS485_LEAF_ID_LEN + 1);
    rs485_miss[rs485_roster_n] = 0;
    rs485_roster_n++;
    LOG_PRINTF("RS485 bridge: yangi leaf ro'yxatga qo'shildi -> %s (jami %d)\n",
               id, rs485_roster_n);
}

static void rs485_roster_remove(int idx) {
    LOG_PRINTF("RS485 bridge: leaf %s juda uzoq (>%d sikl) javob bermadi — ro'yxatdan chiqarildi\n",
               rs485_roster[idx], RS485_BRIDGE_MAX_MISS);
    for (int i = idx; i < rs485_roster_n - 1; i++) {
        strncpy(rs485_roster[i], rs485_roster[i + 1], RS485_LEAF_ID_LEN + 1);
        rs485_miss[i] = rs485_miss[i + 1];
    }
    rs485_roster_n--;
}

static void rs485_bridge_init() {
    rs485_init();
    LOG_PRINTF("RS485 bridge: bino ichi RX=%d TX=%d DE=%d @%lu baud, adresli poll, har %lus\n",
               RS485_BUS_RX, RS485_BUS_TX, RS485_BUS_DE, (unsigned long)RS485_BAUD,
               RS485_BRIDGE_POLL_MS / 1000);
}

// Bitta leaf'dan kelgan JSON'ga timestamp qo'shib, backend'ga yuboradi
// (yoki WiFi/server yo'q bo'lsa offline buferga saqlaydi) — main.cpp'dagi
// o'zining reading yuborish yo'li bilan bir xil mantiq.
static void rs485_bridge_forward(const char* json_in) {
    // Leaf o'qishini BRIDGE nomidan yuboramiz — backend'da faqat bitta qurilma
    // (bu bridge) ko'rinadi, leaf'lar alohida qurilma sifatida chiqmaydi.
    // utility_type saqlanadi, shuning uchun bino ko'rinishida har sensor turi
    // (elektr/suv/gaz/issiqlik...) baribir ajraladi. Leaf'ning asl MAC'i
    // source_id sifatida saqlanadi (traceability uchun, ixtiyoriy).
    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, json_in)) {
        buf_push(String(json_in));   // parse bo'lmasa o'z holicha buferga
        return;
    }
    const char* leaf_mac = doc["device_id"] | "";
    if (leaf_mac[0]) doc["source_id"] = leaf_mac;
    doc["device_id"] = device_id;    // bridge (yagona qurilma)

    char _ts[25];
    if (diag_timestamp(_ts, sizeof(_ts))) doc["timestamp"] = _ts;

    String json;
    serializeJson(doc, json);
    if (WiFi.status() == WL_CONNECTED && server_ok) {
        if (!http_post("/api/readings", json)) buf_push(json);
    } else {
        buf_push(json);
    }
}

// Kelgan JSON'dan device_id ni ajratib oladi (ro'yxat uchun). Bo'sh = xato.
// Doc yetarlicha katta bo'lishi shart — leaf JSON'i ~150-450 bayt bo'ladi,
// kichik doc "NoMemory" berib to'liq parse qilolmaydi.
static bool rs485_extract_id(const char* json, char* out, size_t out_sz) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, json,
        DeserializationOption::NestingLimit(6));
    if (err) return false;
    const char* id = doc["device_id"];
    if (!id || !id[0]) return false;
    strncpy(out, id, out_sz - 1);
    out[out_sz - 1] = '\0';
    return true;
}

#if defined(HAVE_LCD)
static unsigned long g_last_elec_lcd_ms = 0;   // oxirgi marta LCD'da elektr ko'rsatilgan vaqt (staleness uchun)

// Elektr leaf shuncha vaqt yangi o'qish bermasa — LCD'da eskirgan qiymatni
// cheksiz ko'rsatib turish o'rniga aniq "malumot yo'q" holati ko'rsatiladi.
// RS485_BRIDGE_POLL_MS (bitta to'liq poll sikli) ning ~3x'i — bir-ikki
// ketma-ket miss qisqa shovqin uchun ekranni o'zgartirmaydi, lekin leaf
// haqiqatan uzilib qolsa (RS485_DISPLAY suv rejimidagi ~60s naqshiga
// o'xshab) tezda "malumot yo'q" ko'rinadi.
#define RS485_BRIDGE_ELEC_STALE_MS (RS485_BRIDGE_POLL_MS * 3UL)

// Yig'ilgan leaf o'qishini LCD'da ko'rsatadi (0-qatorda qiymat, 1-qatorda
// "A1TECH  BRR"). building_bridge SENSOR_ELECTRICITY'ning elec_lcd_row()'idan
// foydalanadi (rs485_bridge.h electricity.h'dan keyin include qilinadi).
static void rs485_bridge_lcd_show(const char* json) {
    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, json)) return;
    const char* ut = doc["utility_type"] | "";
    // LCD'da FAQAT elektr ko'rsatiladi — suv/gaz/tuproq/ovoz/issiqlik va keyingi
    // sensorlar ekranni o'zgartirmaydi (server'ga baribir forward qilinadi).
    if (strcmp(ut, "electricity") != 0) return;
    // Faqat kuchlanish + quvvat (tok ko'rsatilmaydi — quvvat muhimroq)
    char r0[17];
    snprintf(r0, sizeof(r0), "%.0fV   %dW",
             (float)(doc["voltage_l1"] | 0.0f), (int)(doc["power_w"] | 0));
    elec_lcd_row(0, r0);
    elec_lcd_row(1, "A1TECH  BRR");
    g_last_elec_lcd_ms = millis();
}

// Elektr leaf uzoq vaqt javob bermasa — LCD'da oxirgi (eskirgan) voltaj/quvvat
// qiymatini cheksiz ko'rsatib turish o'rniga aniq ogohlantirish chiqaradi.
// rs485_bridge_poll_cycle() har sikl oxirida chaqiradi.
static void rs485_bridge_lcd_check_stale() {
    if (g_last_elec_lcd_ms == 0) return;   // hali birorta elektr o'qish kelmagan
    if (millis() - g_last_elec_lcd_ms <= RS485_BRIDGE_ELEC_STALE_MS) return;
    elec_lcd_row(0, "El: malumot yo'q");
}
#endif

// Bitta kelgan freymni tekshirib (yaroqli JSON'mi) forward qiladi va
// device_id'ni id_out'ga yozadi. true = yaroqli o'qish qabul qilindi.
static bool rs485_bridge_consume(const uint8_t* buf, uint16_t n, char* id_out, size_t id_sz) {
    char tmp[RS485_MAX_FRAME + 1];
    if (n > RS485_MAX_FRAME) return false;
    memcpy(tmp, buf, n); tmp[n] = '\0';
    if (!rs485_extract_id(tmp, id_out, id_sz)) {
        LOG_PRINTLN("RS485 bridge: yaroqsiz/buzilgan javob — tashlandi");
        return false;
    }
    LOG_PRINTF("RS485 bridge: %s -> %s\n", id_out, tmp);
#if defined(HAVE_LCD)
    rs485_bridge_lcd_show(tmp);
#endif
    rs485_bridge_forward(tmp);
    return true;
}

// DISCOVER broadcast — yangi leaf'larni topadi (va javoblarini forward qiladi).
static void rs485_bridge_discover() {
    // DISCOVER'ni bir necha marta takrorlaymiz. Bir raundда ikki leaf javobi
    // to'qnashsa (jitter ustma-ust), keyingi raundда tasodifiy jitter ularni
    // ajratadi va ikkalasi ham ro'yxatga tushadi. roster_add idempotent.
    for (int round = 0; round < RS485_BRIDGE_DISCOVER_ROUNDS; round++) {
        uint8_t cmd = RS485_CMD_DISCOVER;
        rs485_send_frame(&cmd, 1);
        LOG_PRINTF("RS485 bridge: DISCOVER #%d yuborildi...\n", round + 1);

        unsigned long win = millis();
        while (millis() - win < RS485_BRIDGE_DISCOVER_MS) {
            wdt_feed();
            uint8_t buf[RS485_MAX_FRAME + 1];
            uint16_t n = rs485_recv_frame(buf, RS485_MAX_FRAME, 300);
            if (n == 0) continue;
            // DISCOVER'da FAQAT ro'yxatga qo'shamiz — forward QILMAYMIZ.
            // (Ilgari har raund forward qilardi: 4 raund × HTTPS POST ~5s = 20s+
            //  → 30s task-watchdog ishga tushib bridge reboot bo'lardi.)
            // Ma'lumot baribir adresli poll siklида forward qilinadi.
            buf[n] = '\0';
            char id[RS485_LEAF_ID_LEN + 1];
            if (rs485_extract_id((const char*)buf, id, sizeof(id))) rs485_roster_add(id);
        }
    }
}

// Bitta leaf'ni ID bo'yicha so'raydi (retry bilan). true = javob keldi.
static bool rs485_bridge_poll_one(const char* id) {
    uint8_t cmd[1 + RS485_LEAF_ID_LEN];
    cmd[0] = RS485_CMD_POLL;
    memcpy(cmd + 1, id, RS485_LEAF_ID_LEN);

    for (int attempt = 0; attempt <= RS485_BRIDGE_RETRY; attempt++) {
        rs485_send_frame(cmd, sizeof(cmd));
        unsigned long win = millis();
        while (millis() - win < RS485_BRIDGE_REPLY_MS) {
            wdt_feed();
            uint8_t buf[RS485_MAX_FRAME + 1];
            uint16_t n = rs485_recv_frame(buf, RS485_MAX_FRAME, 300);
            if (n == 0) continue;
            char rid[RS485_LEAF_ID_LEN + 1];
            if (rs485_bridge_consume(buf, n, rid, sizeof(rid)) &&
                strncmp(rid, id, RS485_LEAF_ID_LEN) == 0) {
                return true;   // aynan so'ralgan leaf javob berdi
            }
            // boshqa/buzilgan javob — shu leaf javobini kutishda davom
        }
    }
    return false;  // retry'lardan keyin ham javob yo'q
}

// Bitta to'liq siklni bajaradi: adresli poll (har leaf navbat bilan) +
// vaqti-vaqti bilan DISCOVER. Vaqt taymeri bilan cheklangan.
static void rs485_bridge_poll_cycle() {
    unsigned long now = millis();
    if (rs485_bridge_last_ms != 0 && now - rs485_bridge_last_ms < RS485_BRIDGE_POLL_MS) return;
    rs485_bridge_last_ms = now;
    rs485_cycle_no++;

    // Ro'yxat bo'sh yoki har DISCOVER_EVERY siklda — yangi leaf qidiramiz.
    if (rs485_roster_n == 0 || (rs485_cycle_no % RS485_BRIDGE_DISCOVER_EVERY) == 0) {
        rs485_bridge_discover();
    }

    // Ma'lum har leaf'ni navbat bilan, ismini aytib so'raymiz — bir vaqtda
    // faqat bittasi gapiradi, to'qnashuv bo'lmaydi.
    int ok = 0;
    for (int i = 0; i < rs485_roster_n; ) {
        // Butun shina o'lik bo'lsa (masalan simlanish nosozligi) bu sikl
        // uzoq davom etishi mumkin — har leaf qadamida watchdog'ni
        // oziqlantiramiz, faqat sikl boshi/oxirida emas.
        wdt_feed();
        if (rs485_bridge_poll_one(rs485_roster[i])) {
            if (rs485_miss[i] >= RS485_BRIDGE_MISS_WARN)
                LOG_PRINTF("RS485 bridge: leaf %s qayta javob berdi (tiklandi)\n", rs485_roster[i]);
            rs485_miss[i] = 0;
            ok++;
            i++;
        } else {
            rs485_miss[i]++;
            // Leaf ro'yxatda QOLADI — javob bermasa, bridge shu leaf uchun
            // reading yubormaydi, backend esa uni last_seen orqali avtomatik
            // "offline/ishlamayapti" deb ko'rsatadi. Qurilma qaytsa tiklanadi.
            if (rs485_miss[i] == RS485_BRIDGE_MISS_WARN)
                LOG_PRINTF("RS485 bridge: leaf %s javob bermayapti — backend offline ko'rsatadi\n",
                           rs485_roster[i]);
            if (rs485_miss[i] >= RS485_BRIDGE_MAX_MISS) {
                rs485_roster_remove(i);   // oxirgi chora: soatlab javob yo'q
            } else {
                i++;
            }
        }
        // Shina va MAX485 drayver yo'nalish uzgichi (DE/RE) tinchlanishi uchun 50ms tanaffus
        unsigned long t = millis(); while (millis() - t < RS485_BRIDGE_INTER_LEAF_GAP_MS) { wdt_feed(); yield(); }
    }
    LOG_PRINTF("RS485 bridge: sikl #%lu tugadi — %d/%d leaf javob berdi\n",
               (unsigned long)rs485_cycle_no, ok, rs485_roster_n);
#if defined(HAVE_LCD)
    rs485_bridge_lcd_check_stale();
#endif
}
