#pragma once
/**
 * lora_crypto.h — LoRa paket CRC (mesh v2)
 *
 * Shifrlash olib tashlandi (default kalit repo'da ochiq turgani uchun
 * amalda real himoya bermas edi, faqat CPU/murakkablik qo'shardi).
 * Paket yaxlitligi faqat CRC16 bilan tekshiriladi.
 */

static void lora_encrypt_pkt(uint8_t* buf, size_t total) {
    lora_crc_set(buf, total);
}
static bool lora_decrypt_pkt(uint8_t* buf, size_t total) {
    return lora_crc_ok(buf, total);
}
