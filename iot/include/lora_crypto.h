#pragma once
/**
 * lora_crypto.h — LoRa AES-128 shifrlash (mesh v2)
 *
 * ESP32 mbedtls hardware AES orqali paket shifrlash.
 * Umumiy header [type(1) + mac(6) + flags(1) + seq(4)] = 12 bayt OCHIQ qoladi
 * (mesh relay deshifrlashsiz ishlashi uchun), qolgan payload + CRC shifrlanadi.
 *
 * Nonce = MAC[6] + pkt_type[1] + block_idx[1] + seq[4] + 0[4]
 * → seq har paketda o'zgargani uchun keystream HECH QACHON takrorlanmaydi
 *   (v1 da nonce faqat MAC+type edi — bu keystream reuse zaifligi edi)
 *
 * Yoqish: -DLORA_ENCRYPT  (platformio.ini da)
 * Kalit:  -DLORA_AES_KEY='{0x..., ...}'  (ixtiyoriy, default mavjud)
 */

#ifdef LORA_ENCRYPT

#include <mbedtls/aes.h>
#include <string.h>

// ─── Master kalit (production da albatta o'zgartiring!) ─────────────────────
#ifndef LORA_AES_KEY
#define LORA_AES_KEY { 0x4D,0x65,0x74,0x65,0x72,0x4D,0x6F,0x6E, \
                       0x69,0x74,0x6F,0x72,0x4B,0x65,0x79,0x31 }
// = "MeterMonitorKey1" — FAQAT test uchun!
#endif

static const uint8_t _lora_aes_key[16] = LORA_AES_KEY;

/**
 * AES-CTR stream cipher — payload (buf+12 dan oxirigacha) shifrlanadi.
 * Shifrlash va deshifrlash bir xil operatsiya (XOR).
 */
static void _lora_crypt_payload(uint8_t* buf, size_t total) {
    if (total <= LORA_HDR_LEN + 2) return;  // min: header(12) + data(1) + crc(2)

    const uint8_t* mac = buf + 1;
    uint8_t pkt_type   = buf[0];
    uint8_t* payload   = buf + LORA_HDR_LEN;
    size_t payload_len = total - LORA_HDR_LEN;

    mbedtls_aes_context ctx;
    mbedtls_aes_init(&ctx);
    mbedtls_aes_setkey_enc(&ctx, _lora_aes_key, 128);

    for (size_t off = 0; off < payload_len; off += 16) {
        // Nonce: MAC[6] + pkt_type + block_idx + seq[4] + zeros
        uint8_t nonce[16] = {0};
        memcpy(nonce, mac, 6);
        nonce[6] = pkt_type;
        nonce[7] = (uint8_t)(off / 16);
        memcpy(nonce + 8, buf + LORA_OFF_SEQ, 4);  // seq (ochiq headerdan)

        uint8_t keystream[16];
        mbedtls_aes_crypt_ecb(&ctx, MBEDTLS_AES_ENCRYPT, nonce, keystream);

        size_t chunk = payload_len - off;
        if (chunk > 16) chunk = 16;
        for (size_t i = 0; i < chunk; i++)
            payload[off + i] ^= keystream[i];
    }
    mbedtls_aes_free(&ctx);
}

/**
 * Shifrlash: CRC → plaintext ustida hisoblanadi (TTL bitlari maskalangan),
 * keyin payload shifrlanadi. TX da ishlatiladi.
 */
static void lora_encrypt_pkt(uint8_t* buf, size_t total) {
    lora_crc_set(buf, total);              // CRC plaintext ustida
    _lora_crypt_payload(buf, total);       // payload shifrlash
}

/**
 * Deshifrlash: payload deshifrlanadi, keyin CRC tekshiriladi.
 * RX da ishlatiladi. false = kalit noto'g'ri yoki buzilgan.
 */
static bool lora_decrypt_pkt(uint8_t* buf, size_t total) {
    _lora_crypt_payload(buf, total);       // payload deshifrlash
    return lora_crc_ok(buf, total);        // CRC plaintext ustida tekshirish
}

#else  // !LORA_ENCRYPT ────────────────────────────────────────────────────────

// Shifrlash o'chirilgan — oddiy CRC
static void lora_encrypt_pkt(uint8_t* buf, size_t total) {
    lora_crc_set(buf, total);
}
static bool lora_decrypt_pkt(uint8_t* buf, size_t total) {
    return lora_crc_ok(buf, total);
}

#endif // LORA_ENCRYPT
