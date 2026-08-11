#pragma once
/**
 * display/disp_heating.h — LCD display module for heating (DS18B20 x2) sensor — iot_v2
 *
 * Implements the standard 3-function display interface:
 *   disp_init()                    → lcd_init() + splash screen
 *   disp_show_reading(d)           → row 0: "K:68.0 Ch:42.0" (kirish/chiqish)
 *   disp_show_status(wifi, srv, lora) → row 1: "A1TECH  BRR" (hammasi OK bo'lsa)
 *                                        yoki "W:OK S:--" (muammo bo'lsa)
 *
 * Bu qurilmada LoRa umuman yo'q (RS-485 / WiFi) — lora parametri ishlatilmaydi.
 *
 * Requires: SensorData from sensors/heating.h (temperature_in_c/out_c, valid)
 */

#include "display/lcd.h"

static void disp_init() {
    lcd_init();
    lcd_row(0, "Meter Monitor");
    lcd_row(1, "WiFi ulanoqda..");
}

static void disp_show_reading(const SensorData& d) {
    char in_s[8], out_s[8];
    if (!isnan(d.temperature_in_c))  snprintf(in_s,  sizeof(in_s),  "%.1f", d.temperature_in_c);
    else                              snprintf(in_s,  sizeof(in_s),  "--.-");
    if (!isnan(d.temperature_out_c)) snprintf(out_s, sizeof(out_s), "%.1f", d.temperature_out_c);
    else                              snprintf(out_s, sizeof(out_s), "--.-");

    char row0[LCD_COLS + 1];
    snprintf(row0, sizeof(row0), "K:%s Ch:%s", in_s, out_s);
    lcd_row(0, row0);
}

static void disp_show_status(bool wifi_ok, bool srv_ok) {
    if (wifi_ok && srv_ok) {
        lcd_row(1, "A1TECH  BRR");
        return;
    }
    char s[LCD_COLS + 1];
    snprintf(s, sizeof(s), "W:%-2s S:%-2s",
             wifi_ok ? "OK" : "--",
             srv_ok  ? "OK" : "--");
    lcd_row(1, s);
}
