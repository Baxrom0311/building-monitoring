#pragma once
/**
 * display/disp_gas.h — LCD 16x2 gaz bosimi sensori uchun
 *
 * 0-qator: "Gaz:   0.03 bar"
 * 1-qator: "A1TECH  BRR" (doimiy)
 */

#include "display/lcd.h"

static char _disp_row0[LCD_COLS + 1] = "";

static void disp_init() {
    lcd_init();
    lcd_row(0, "Gaz Sensori");
    lcd_row(1, "A1TECH  BRR");
}

static void disp_show_reading(const SensorData& d) {
    char buf[LCD_COLS + 1];
    if (d.valid && !isnan(d.pressure_bar))
        snprintf(buf, sizeof(buf), "Gaz: %6.3f bar", d.pressure_bar);
    else
        snprintf(buf, sizeof(buf), "Gaz:     -- bar");

    if (strcmp(buf, _disp_row0) != 0) {
        lcd_row(0, buf);
        strncpy(_disp_row0, buf, sizeof(_disp_row0) - 1);
        _disp_row0[sizeof(_disp_row0) - 1] = '\0';
    }
}

static void disp_show_status(bool, bool) {
    // 1-qator doim "A1TECH  BRR" — WiFi/server holatidan qat'i nazar o'zgarmaydi.
}
