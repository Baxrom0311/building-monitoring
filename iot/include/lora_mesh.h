#pragma once
/**
 * lora_mesh.h — Mesh v2 umumiy qatlam (node va gateway uchun)
 *
 * Vazifalari:
 *   - seq hisoblagich (NVS da saqlanadi, restartda davom etadi)
 *   - dedup jadvali (pkt_type, mac, seq) — ochiq header bo'yicha,
 *     deshifrlashsiz ishlaydi
 *   - relay: TTL-- qilib qayta uzatish (CRC TTL-mask tufayli buzilmaydi)
 *   - ACK yuborish
 *
 */

#include <Preferences.h>

// ─── Sozlamalar ───────────────────────────────────────────────────────────────
#define MESH_DEDUP_SIZE       16
#define MESH_DEDUP_TTL_MS     60000UL  // oddiy paketlar uchun dedup oynasi
#define MESH_DEDUP_ACK_TTL_MS 2000UL   // ACK lar uchun qisqa oyna — gateway
                                       // retry paytida qayta ACK yuborganda
                                       // relaylar uni ham uzatishi uchun
#define MESH_SEQ_SAVE_STEP    16       // NVS ga har 16 paketda yozish (wear-safe)

// ─── Holat ────────────────────────────────────────────────────────────────────
struct MeshDedupEntry {
    uint8_t       type;
    uint8_t       mac[6];
    uint32_t      seq;
    unsigned long time_ms;
    bool          used;
};

static MeshDedupEntry mesh_dedup[MESH_DEDUP_SIZE];
static int            mesh_dedup_idx = 0;
static uint8_t        mesh_self_mac[6];
static uint32_t       mesh_seq       = 0;
static uint32_t       mesh_seq_saved = 0;
static Preferences    mesh_prefs;

// ─── Init: seq ni NVS dan tiklash ────────────────────────────────────────────
static void mesh_init(const uint8_t* self_mac) {
    memcpy(mesh_self_mac, self_mac, 6);
    memset(mesh_dedup, 0, sizeof(mesh_dedup));
    mesh_prefs.begin("mesh", false);
    // Restartda oldinga sakraymiz — saqlanmagan oxirgi qadamlar takrorlanmasin
    mesh_seq = mesh_prefs.getULong("seq", 0) + MESH_SEQ_SAVE_STEP;
    mesh_prefs.putULong("seq", mesh_seq);
    mesh_prefs.end();
    mesh_seq_saved = mesh_seq;
}

static uint32_t mesh_next_seq() {
    mesh_seq++;
    if (mesh_seq - mesh_seq_saved >= MESH_SEQ_SAVE_STEP) {
        mesh_prefs.begin("mesh", false);
        mesh_prefs.putULong("seq", mesh_seq);
        mesh_prefs.end();
        mesh_seq_saved = mesh_seq;
    }
    return mesh_seq;
}

// ─── Dedup (ochiq header bo'yicha, deshifrlash kerak emas) ───────────────────
static bool mesh_dedup_seen(const uint8_t* buf, size_t len) {
    if (len < LORA_HDR_LEN) return true;  // yaroqsiz — "ko'rilgan" deb tashlaymiz
    uint8_t  type = buf[0];
    uint32_t seq  = lora_hdr_seq(buf);
    unsigned long ttl = (type == PKT_ACK) ? MESH_DEDUP_ACK_TTL_MS : MESH_DEDUP_TTL_MS;
    unsigned long now = millis();
    for (int i = 0; i < MESH_DEDUP_SIZE; i++) {
        const MeshDedupEntry& e = mesh_dedup[i];
        if (e.used && e.type == type && e.seq == seq &&
            memcmp(e.mac, buf + 1, 6) == 0 && (now - e.time_ms) < ttl)
            return true;
    }
    return false;
}

static void mesh_dedup_record(const uint8_t* buf, size_t len) {
    if (len < LORA_HDR_LEN) return;
    MeshDedupEntry& e = mesh_dedup[mesh_dedup_idx];
    e.type = buf[0];
    memcpy(e.mac, buf + 1, 6);
    e.seq     = lora_hdr_seq(buf);
    e.time_ms = millis();
    e.used    = true;
    mesh_dedup_idx = (mesh_dedup_idx + 1) % MESH_DEDUP_SIZE;
}

// ─── TX (tayyor/shifrlangan bufer) va RX rejimga qaytish ─────────────────────
static bool mesh_tx_raw(const uint8_t* buf, size_t len) {
    LoRa.beginPacket();
    LoRa.write(buf, len);
    bool ok = LoRa.endPacket();
    LoRa.receive();
    return ok;
}

// ─── ACK yuborish ────────────────────────────────────────────────────────────
// owner_mac + seq + ack_type = tasdiqlanayotgan paket identifikatori
static void mesh_send_ack(const uint8_t* owner_mac, uint32_t seq, uint8_t ack_type) {
    LoRaAck ack;
    memset(&ack, 0, sizeof(ack));
    ack.pkt_type = PKT_ACK;
    memcpy(ack.mac, owner_mac, 6);
    ack.flags    = LORA_TTL_DEFAULT << LORA_TTL_SHIFT;
    ack.seq      = seq;
    ack.ack_type = ack_type;
    lora_encrypt_pkt((uint8_t*)&ack, sizeof(ack));
    // Relay to'lqini bilan to'qnashmaslik uchun kichik tasodifiy kechikish
    unsigned long d = random(30, 120);
    unsigned long t = millis(); while (millis() - t < d) yield();
    mesh_tx_raw((uint8_t*)&ack, sizeof(ack));
}

// ─── Relay: TTL kamaytirib qayta uzatish ─────────────────────────────────────
// Chaqirishdan OLDIN dedup seen/record qilingan bo'lishi kerak.
// Paket shifrlangan holicha uzatiladi (header ochiq, TTL mask CRC ni saqlaydi).
static void mesh_relay(uint8_t* buf, size_t len) {
    uint8_t ttl = lora_ttl_get(buf[LORA_OFF_FLAGS]);
    if (ttl == 0) return;  // TTL tugagan
    buf[LORA_OFF_FLAGS] = lora_ttl_dec(buf[LORA_OFF_FLAGS]);

    // To'qnashuv oldini olish: tasodifiy kechikish
    unsigned long d = random(50, 300);
    unsigned long t = millis(); while (millis() - t < d) { wdt_feed(); yield(); }

    bool ok = mesh_tx_raw(buf, len);
    LOG_PRINTF("RELAY: %02X%02X%02X.. type=0x%02X seq=%lu TTL=%d %s\n",
               buf[1], buf[2], buf[3], buf[0],
               (unsigned long)lora_hdr_seq(buf), ttl - 1, ok ? "OK" : "XATO");
}
