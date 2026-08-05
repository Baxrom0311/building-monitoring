#pragma once
/**
 * core/http.h — HTTP yordamchi + server check + OTA
 *
 * TLS: ISRG Root X1 (Let's Encrypt) sertifikati orqali tekshiriladi.
 *       -DTLS_INSECURE → sertifikat tekshirilmaydi (faqat debug)
 *
 * OTA: Watchdog to'xtatiladi, yuklanadi, firmware tasdiqlanadi.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <ArduinoJson.h>
#include "core/log.h"
#include "core/config.h"

// ─── TLS sertifikat (ISRG Root X1 — Let's Encrypt, 2035 gacha) ──────────────
#ifndef TLS_INSECURE
static const char TLS_ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";
#endif  // TLS_INSECURE

static WiFiClientSecure g_secure_client;

static bool http_begin_url(HTTPClient& http, const char* url) {
    if (strncmp(url, "https://", 8) == 0) {
#ifdef TLS_INSECURE
        g_secure_client.setInsecure();
#else
        g_secure_client.setCACert(TLS_ROOT_CA);
#endif
        return http.begin(g_secure_client, url);
    }
    return http.begin(url);
}

// HTTP javob hajmi limiti (default: 4KB — heap himoyasi)
#ifndef HTTP_MAX_RESPONSE
  #define HTTP_MAX_RESPONSE  4096
#endif

static void http_prepare(HTTPClient& http, uint16_t timeout_ms) {
    http.setTimeout(timeout_ms);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
}

// Xavfsiz getString — hajm limitidan oshsa bo'sh qaytaradi
static String http_safe_body(HTTPClient& http) {
    int len = http.getSize();
    if (len > HTTP_MAX_RESPONSE) {
        LOG_PRINTF("HTTP: javob juda katta (%d > %d) — o'tkazib yuborildi\n",
                   len, HTTP_MAX_RESPONSE);
        return "";
    }
    // Content-Length yo'q bo'lsa (-1), chunked transfer — stream dan o'qish
    if (len < 0) {
        String body = http.getString();
        if ((int)body.length() > HTTP_MAX_RESPONSE) {
            LOG_PRINTF("HTTP: chunked javob juda katta (%d)\n", (int)body.length());
            return "";
        }
        return body;
    }
    return http.getString();
}

static bool http_post(const char* path, const String& body) {
    if (WiFi.status() != WL_CONNECTED) return false;
    HTTPClient http;
    char url[220];
    snprintf(url, sizeof(url), "%s%s", g_cfg.server_url, path);
    if (!http_begin_url(http, url)) return false;
    http.addHeader("Content-Type", "application/json");
    if (g_cfg.device_token[0])
        http.addHeader("X-Device-Token", g_cfg.device_token);
    http.setTimeout(5000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    int code = http.POST(body);
    if (code < 200 || code >= 300)
        LOG_PRINTF("POST %s: %d %s\n", path, code, http_safe_body(http).c_str());
    http.end();
    return code >= 200 && code < 300;
}

static String http_get(const char* path) {
    if (WiFi.status() != WL_CONNECTED) return "";
    HTTPClient http;
    char url[220];
    snprintf(url, sizeof(url), "%s%s", g_cfg.server_url, path);
    if (!http_begin_url(http, url)) return "";
    if (g_cfg.device_token[0])
        http.addHeader("X-Device-Token", g_cfg.device_token);
    http.setTimeout(5000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    int code = http.GET();
    String resp = (code == 200) ? http_safe_body(http) : "";
    if (code < 200 || code >= 300)
        LOG_PRINTF("GET %s: %d\n", path, code);
    http.end();
    return resp;
}

static bool server_check() {
    if (WiFi.status() != WL_CONNECTED) return false;
    HTTPClient http;
    char url[120];
    snprintf(url, sizeof(url), "%s/health", g_cfg.server_url);
    if (!http_begin_url(http, url)) return false;
    http.setTimeout(5000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    int code = http.GET();
    http.end();
    return code >= 200 && code < 300;
}

// OTA natijasini backendga xabar qilish (/api/ota/report) — batch monitoring uchun
static void ota_send_report(const char* device_id, const char* status,
                            const char* target_version, const char* from_version) {
    StaticJsonDocument<256> doc;
    doc["device_id"] = device_id;
    doc["status"]    = status;
    if (target_version && target_version[0]) doc["target_version"] = target_version;
    if (from_version && from_version[0])     doc["from_version"]   = from_version;
    String body; serializeJson(doc, body);
    http_post("/api/ota/report", body);
}

static void ota_check(const char* device_id, const char* fw_version) {
    // Oldingi OTA natijasi (reboot dan keyin): NVS da saqlangan target versiya
    // hozirgi FW_VERSION bilan mos bo'lsa — success, aks holda failed
    {
        g_prefs.begin("app", false);
        String tgt = g_prefs.getString("ota_tgt", "");
        if (tgt.length()) {
            g_prefs.remove("ota_tgt");
            g_prefs.end();
            bool ok = (tgt == fw_version);
            ota_send_report(device_id, ok ? "success" : "failed", tgt.c_str(), nullptr);
            LOG_PRINTF("OTA natija: %s (target=%s, joriy=%s)\n",
                       ok ? "success" : "failed", tgt.c_str(), fw_version);
        } else {
            g_prefs.end();
        }
    }

    HTTPClient http;
    char url[220];
    snprintf(url, sizeof(url), "%s/api/ota/check/%s?current_version=%s",
             g_cfg.server_url, device_id, fw_version);
    if (!http_begin_url(http, url)) return;
    if (g_cfg.device_token[0])
        http.addHeader("X-Device-Token", g_cfg.device_token);
    http.setTimeout(5000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    int code = http.GET();
    if (code != 200) { http.end(); return; }
    StaticJsonDocument<256> doc;
    String ota_resp = http_safe_body(http);
    if (ota_resp.isEmpty() || deserializeJson(doc, ota_resp)) { http.end(); return; }
    http.end();
    if (!doc["update"].as<bool>()) return;
    String fw_url  = String(g_cfg.server_url) + doc["url"].as<String>();
    String new_ver = doc["version"].as<String>();
    LOG_PRINTF("OTA: v%s yuklanmoqda...\n", new_ver.c_str());

    // Target versiyani NVS ga yozamiz — reboot dan keyin success/failed xabari uchun
    g_prefs.begin("app", false);
    g_prefs.putString("ota_tgt", new_ver);
    g_prefs.end();
    ota_send_report(device_id, "started", new_ver.c_str(), fw_version);

    // Watchdog to'xtatish (OTA uzoq davom etishi mumkin)
    wdt_pause();

    if (fw_url.startsWith("https://")) {
        WiFiClientSecure fw_client;
#ifdef TLS_INSECURE
        fw_client.setInsecure();
#else
        fw_client.setCACert(TLS_ROOT_CA);
#endif
        if (httpUpdate.update(fw_client, fw_url) == HTTP_UPDATE_OK) ESP.restart();
    } else {
        HTTPClient fw_http;
        fw_http.begin(fw_url);
        if (httpUpdate.update(fw_http) == HTTP_UPDATE_OK) ESP.restart();
    }

    // OTA muvaffaqiyatsiz bo'ldi — watchdog qaytarish
    LOG_PRINTLN("OTA: yuklash xato!");
    ota_send_report(device_id, "failed", new_ver.c_str(), fw_version);
    g_prefs.begin("app", false);
    g_prefs.remove("ota_tgt");
    g_prefs.end();
    wdt_resume();
}
