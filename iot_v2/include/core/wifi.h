#pragma once
/**
 * core/wifi.h — WiFi boshqaruvi (non-blocking)
 *
 * Falsafa: portal FAQAT sozlanmagan qurilmada (yoki BOOT tugma bilan) ochiladi.
 * Router vaqtincha o'chiq bo'lsa qurilma 3 daqiqa portalda QOTIB TURMAYDI —
 * ≤16s urinib, ishga tushadi va fonda har 15s qayta ulanadi.
 *
 * wifi_has_saved_creds() — NVS da saqlangan SSID bormi
 * wifi_connect_boot()    — Setup: tez, portalsiz ulanish (≤16s)
 * wifi_portal()          — WiFiManager sozlash portali (birinchi yoqish/BOOT)
 * wifi_loop()            — Loop: non-blocking qayta ulanish
 * wifi_pause()           — RS-485 uchun radio to'xtatish
 * wifi_resume()          — Radio qayta yoqish
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <esp_wifi.h>
#include "core/log.h"
#include "core/config.h"

#define WIFI_RECONNECT_MS     15000UL
#define WIFI_BOOT_TIMEOUT_MS   8000UL
// Sozlash portali qancha ochiq turadi (soniya). 0 = doim ochiq (sozlanmaguncha).
// Bridge/collector uchun 0 qilinadi (build flag bilan) — WiFi bo'lmasa baribir
// ishlay olmaydi, shuning uchun AP doim ochiq tursin.
#ifndef WIFI_PORTAL_TIMEOUT_S
  #define WIFI_PORTAL_TIMEOUT_S    120
#endif

// TX quvvatini standart maksimal (~19.5dBm) dan pasaytiramiz — WiFi TX
// paytidagi oqim sakrashi past-marja quvvat manbalarida brownout'ni
// yolg'on ishga tushirishi mumkin (hujjatlashtirilgan xavf). BOD chegarasini
// o'zgartirish o'rniga sababni (oqim sakrashi) kamaytiramiz — bino ichi
// masofalar uchun 17dBm doim yetarli bo'ladi. Kerak bo'lsa build flag bilan
// qayta belgilash mumkin.
#ifndef WIFI_TX_POWER
  #define WIFI_TX_POWER WIFI_POWER_17dBm
#endif

static unsigned long _wifi_reconnect_ms = 0;

// NVS da saqlangan WiFi SSID bormi (birinchi yoqishni aniqlash uchun)
static bool wifi_has_saved_creds() {
    WiFi.mode(WIFI_STA);  // driver init — idempotent
    wifi_config_t conf;
    if (esp_wifi_get_config(WIFI_IF_STA, &conf) != ESP_OK) return false;
    if (conf.sta.ssid[0] == 0) return false;
    return true;
}

// Setup: portalsiz tez ulanish. Saqlangan creds → keyin default (bo'lsa).
static bool wifi_connect_boot(const char* def_ssid, const char* def_pass) {
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setTxPower(WIFI_TX_POWER);

    bool has_def = (def_ssid && def_ssid[0]);
    bool saved = wifi_has_saved_creds();
    if (saved) {
        WiFi.begin();  // saqlangan creds bilan
    } else if (has_def) {
        WiFi.begin(def_ssid, def_pass);
    } else {
        return false;  // hech qanday ma'lumot yo'q — portal kerak
    }

    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < WIFI_BOOT_TIMEOUT_MS)
        yield();

    // Saqlangan creds eskirgan bo'lishi mumkin — default bilan bitta urinish
    if (WiFi.status() != WL_CONNECTED && saved && has_def) {
        WiFi.disconnect(true);
        t = millis(); while (millis() - t < 300) yield();
        WiFi.begin(def_ssid, def_pass);
        t = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - t < WIFI_BOOT_TIMEOUT_MS)
            yield();
    }

    if (WiFi.status() == WL_CONNECTED) {
        LOG_PRINTF("WiFi: %s (%ddBm)\n",
                   WiFi.localIP().toString().c_str(), WiFi.RSSI());
        return true;
    }
    LOG_PRINTLN("WiFi: hozircha offline — fonda qayta ulanadi");
    return false;
}

// Non-blocking — faqat reconnect buyrug'i, blokirovka yo'q
static void wifi_loop() {
    if (WiFi.status() == WL_CONNECTED) return;
    unsigned long now = millis();
    if (now - _wifi_reconnect_ms < WIFI_RECONNECT_MS) return;
    _wifi_reconnect_ms = now;
    WiFi.reconnect();
    LOG_PRINTLN("WiFi: qayta ulanish...");
}

static void wifi_pause() {
    esp_wifi_stop();
    unsigned long t = millis();
    while (millis() - t < 80) yield();
}

static bool wifi_resume() {
    esp_wifi_start();
    WiFi.setTxPower(WIFI_TX_POWER);  // esp_wifi_start() standart quvvatga qaytarishi mumkin
    WiFi.reconnect();
    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 3000) yield();
    return WiFi.status() == WL_CONNECTED;
}

// Sozlash portali — FAQAT birinchi yoqilishda yoki BOOT tugma bilan chaqiriladi.
// 120s ichida sozlanmasa qurilma ishga tushib ketadi (keyin BOOT bilan qayta ochish mumkin).
static void wifi_portal(const char* ap_name, const char* ap_pass,
                        const char* device_mac = "",
                        const char* meter_serial = "") {
    char info_html[320];
    snprintf(info_html, sizeof(info_html),
        "<p style='background:#1e293b;border:1px solid #334155;border-radius:8px;"
        "padding:10px;font-size:12px;color:#94a3b8;margin-bottom:8px'>"
        "<b style='color:#60a5fa'>ID:</b> %s<br>"
        "<b style='color:#60a5fa'>Meter:</b> %s<br>"
        "<b style='color:#60a5fa'>Rejim:</b> %s</p>",
        device_mac[0] ? device_mac : "...",
        meter_serial[0] ? meter_serial : "...",
        g_cfg.test_mode ? "TEST" : "PROD"
    );

    WiFiManagerParameter p_info(info_html);
    WiFiManagerParameter p_srv("server", "Server URL", g_cfg.server_url, 99);
    WiFiManagerParameter p_tok("token", "API token", g_cfg.device_token, 63);
    WiFiManagerParameter p_prov("prov_token", "Provisioning Token", g_cfg.provisioning_token, 63);
    WiFiManagerParameter p_mode("mode", "Rejim: prod/test", g_cfg.test_mode ? "test" : "prod", 8);

    WiFiManager wm;
    wm.setTitle("Meter Monitor");
    wm.addParameter(&p_info);
    wm.addParameter(&p_srv);
    wm.addParameter(&p_tok);
    wm.addParameter(&p_prov);
    wm.addParameter(&p_mode);
    wm.setConnectTimeout(20);
    wm.setConfigPortalTimeout(WIFI_PORTAL_TIMEOUT_S);
    wm.setSaveConfigCallback([&]() {
        cfg_save(p_srv.getValue(), p_tok.getValue(),
                 p_mode.getValue(), p_prov.getValue());
    });
    wm.setCustomHeadElement(
        "<style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0}"
        ".wrap{background:#1e293b;border-radius:12px}"
        "input{background:#0f172a!important;color:#e2e8f0!important;"
        "border:1px solid #334155!important}"
        "button{background:#3b82f6!important}</style>"
    );

    LOG_PRINTF("WiFi: sozlash portali ochildi — AP '%s' (%ds)\n",
               ap_name, WIFI_PORTAL_TIMEOUT_S);
    wm.startConfigPortal(ap_name, ap_pass);

    if (WiFi.status() == WL_CONNECTED) {
        WiFi.setSleep(false);
        LOG_PRINTF("WiFi: %s (%ddBm)\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    } else {
        LOG_PRINTLN("WiFi: portal yopildi, offline — fonda qayta ulanadi");
    }
}

// Eski nom bilan moslik (chaqiruvchi kod bosqichma-bosqich yangilanadi)
static void wifi_setup(const char* ap_name, const char* ap_pass,
                       const char* device_mac = "",
                       const char* meter_serial = "") {
    wifi_portal(ap_name, ap_pass, device_mac, meter_serial);
}
