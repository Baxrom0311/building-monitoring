#pragma once
/**
 * display/lcd.h — LCD 16x2 I2C driver (self-healing)
 *
 * Override: -DLCD_SDA=21  -DLCD_SCL=22  -DLCD_ADDR=0x27
 *
 * WiFi TX oqim sakrashi (~500mA) ta'minotni bir lahzaga cho'ktirib, LCD
 * backpack'ni (PCF8574) reset qilib qo'yishi mumkin — ekran o'chadi/shovqin
 * chiqadi, ESP32 esa qayta yuklanmaydi. Shuning uchun ekran holatini muntazam
 * tekshirib, kerak bo'lsa darhol qayta init qilamiz va oxirgi matnni qayta
 * chizamiz.
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <string.h>

#ifndef LCD_ADDR
  #define LCD_ADDR  0x27
#endif
#ifndef LCD_SDA
  #define LCD_SDA   21
#endif
#ifndef LCD_SCL
  #define LCD_SCL   22
#endif
#define LCD_COLS  16
#define LCD_ROWS   2

static LiquidCrystal_I2C g_lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
static bool g_lcd_ok = false;
static unsigned long g_lcd_last_refresh = 0;

// Oxirgi yozilgan qatorlar — majburiy qayta init'dan keyin darhol qayta chizish
static char g_lcd_row_cache[LCD_ROWS][LCD_COLS + 1] = {{0}};
static bool g_lcd_row_has_content[LCD_ROWS] = {false};

// PCF8574 I2C orqali javob berayotganini tekshirish
static bool _lcd_i2c_alive() {
    Wire.beginTransmission(LCD_ADDR);
    return Wire.endTransmission() == 0;
}

static void _lcd_hard_reinit() {
    g_lcd.init();
    g_lcd.backlight();
    g_lcd_last_refresh = millis();
    for (uint8_t r = 0; r < LCD_ROWS; r++) {
        if (!g_lcd_row_has_content[r]) continue;
        g_lcd.setCursor(0, r);
        g_lcd.print(g_lcd_row_cache[r]);
    }
}

static void lcd_init() {
    Wire.begin(LCD_SDA, LCD_SCL);
    g_lcd.init();
    g_lcd.backlight();
    g_lcd.clear();
    g_lcd_last_refresh = millis();
    g_lcd_ok = _lcd_i2c_alive();
    if (g_lcd_ok) {
        LOG_PRINTF("  LCD 16x2 I2C (0x%02X, SDA=%d, SCL=%d): OK\n",
                   LCD_ADDR, LCD_SDA, LCD_SCL);
    } else {
        LOG_PRINTF("  LCD 16x2 I2C (0x%02X, SDA=%d, SCL=%d): FAIL (no ACK)\n",
                   LCD_ADDR, LCD_SDA, LCD_SCL);
    }
}

// FAQAT I2C haqiqatan javob bermay qolganda qayta init qilamiz. Muntazam
// (vaqt bo'yicha) init QILMAYMIZ — u ekranni tozalab qayta chizadi, natijada
// ko'zga tashlanadigan miltillash/"reload" bo'lardi.
static void lcd_refresh_if_needed() {
    if (!g_lcd_ok) return;
    if (!_lcd_i2c_alive()) {
        _lcd_hard_reinit();
    }
}

static void lcd_row(uint8_t row, const char* text) {
    if (!g_lcd_ok) return;
    lcd_refresh_if_needed();
    char buf[LCD_COLS + 1];
    snprintf(buf, sizeof(buf), "%-*s", LCD_COLS, text);

    if (row < LCD_ROWS) {
        memcpy(g_lcd_row_cache[row], buf, LCD_COLS + 1);
        g_lcd_row_has_content[row] = true;
    }

    g_lcd.setCursor(0, row);
    g_lcd.print(buf);

    // Yozish paytida glitch bo'lsa — darhol qayta init + qayta chizish
    if (!_lcd_i2c_alive()) {
        _lcd_hard_reinit();
    }
}
