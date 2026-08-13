# iot_v2 — ESP32 Firmware O'rnatish Qo'llanmasi

Bu papkada Meter Monitor tizimining ESP32 firmware kodi joylashgan — elektr, suv, gaz, tuproq namligi, ovoz va isitish sensorlari uchun. LoRa YO'Q — har bir bino WiFi/internetga ega bo'lgani uchun bino ichidagi sensorlar RS-485 orqali bitta "bridge" ESP32'ga ulanadi, bridge esa oddiy WiFi orqali backend'ga yuboradi.

## 1. Kerakli asboblar

- **PlatformIO CLI** (kompyuterda o'rnatilgan bo'lishi kerak):
  ```bash
  pip install platformio
  # yoki: brew install platformio (macOS)
  ```
- USB-orqali dasturlash kabeli (ESP32 board'ga qarab micro-USB yoki USB-C)
- Fizik qurilma turi (quyidagi jadvaldan qaysi sensor ekanini bilish kerak)

## 2. Qaysi qurilmaga qaysi firmware kerak?

Avval qurilmangiz **qanday ulanishini** aniqlang:

- **Standalone WiFi** — qurilma o'zi to'g'ridan-to'g'ri WiFi router'ga ulanadi va backend'ga yuboradi. Bitta ESP32 = bitta sensor.
- **RS-485 leaf** — qurilma bino ichidagi umumiy RS-485 shinasiga (2 sim, A/B) ulanadi, o'zi WiFi'ga ulanmaydi. Ma'lumotni "bridge" qurilmasiga yuboradi.
- **Bridge** — RS-485 shinasini so'raydi (barcha leaf'lardan), o'z elektr hisoblagichini ham DLMS orqali o'qiydi, va hammasini WiFi orqali backend'ga yuboradi. Har bir binoda **bitta** bridge bo'ladi.

### Standalone WiFi (to'g'ridan-to'g'ri)

| Sensor | Environment nomi | LCD bormi | Eslatma |
|---|---|---|---|
| Tuproq namligi | `soil_wifi_lcd` | Ha | LCD yo'q bo'lsa `soil_wifi` ishlating |
| Ovoz darajasi | `sound_wifi_lcd` | Ha | |
| Elektr hisoblagich (TE71/TE73) | `electricity` | Ha | RS-485 DLMS orqali metrni o'qiydi |
| Suv bosimi | `water` | Yo'q | ADS1115 kerak |
| Gaz bosimi | `gas` | Yo'q | ADS1115 + 4-20mA transmitter kerak (pressure switch YETARLI EMAS) |
| Qozonxona isitish (kirish/chiqish harorat) | `heating` | Yo'q | 2x DS18B20 |

### RS-485 leaf (bino ichi shinaga ulangan)

| Sensor | Environment nomi |
|---|---|
| Suv bosimi | `water_rs485_leaf` |
| Gaz bosimi | `gas_rs485_leaf` |
| Tuproq namligi | `soil_rs485_leaf` |
| Tuproq namligi + havo sifati (MQ135) | `soil_mq135_rs485_leaf` |
| Ovoz darajasi | `sound_rs485_leaf` |
| Qozonxona isitish | `heating_rs485_leaf` |
| Elektr hisoblagich | `electricity_rs485_leaf` |

### Bridge

| Vazifa | Environment nomi |
|---|---|
| Bino markazi — o'z elektr hisoblagichini o'qiydi + RS-485 shinasidan barcha leaf'larni yig'ib WiFi orqali yuboradi | `building_bridge` |

### Test / diagnostika (faqat texnik tekshiruv uchun, production emas)

| Vazifa | Environment nomi |
|---|---|
| ADS1115 chip test (I2C 0x48) | `ads1115_test` |
| RS-485 freym protokoli o'z-o'zini sinash | `rs485_selftest` |
| RS-485 master/poll simulyatori | `rs485_master_test` |
| RS-485 xom bayt monitor | `rs485_rxmon` |
| RS-485 shinadan passiv suv displeyi | `water_display` |
| Tuproq + MQ135 stol ustida test | `soil_mq135_test` |

**Diqqat**: test/diagnostika rejimlari (ayniqsa `rs485_master_test`, `rs485_rxmon`) jonli production RS-485 shinasiga ulamang — ular DISCOVER paketlarini yuboradi va haqiqiy bridge bilan to'qnashishi mumkin (kod ogohlantirish chiqaradi, lekin bloklamaydi).

## 3. Flash qilish

```bash
cd iot_v2
pio run -e <environment_nomi> -t upload --upload-port /dev/cu.usbserial-XXXX
```

Port nomini bilmasangiz:
```bash
pio device list
```

Serial monitor (loglarni ko'rish uchun):
```bash
pio device monitor -p /dev/cu.usbserial-XXXX -b 115200
```

## 4. Birinchi ishga tushirish — WiFi sozlash

Qurilma birinchi marta yoqilganda (yoki BOOT tugmasi bosilib WiFi tozalangandan keyin) **o'zi WiFi Access Point (AP) ochadi**:

1. Telefon/kompyuterda WiFi ro'yxatidan qurilma nomini toping (LCD'da yoki serial logda ko'rsatiladi, masalan "MeterSetup-XXXX").
2. Unga ulaning (parol LCD/logda ko'rsatiladi).
3. Ochilgan sahifada (odatda avtomatik ochiladi — "captive portal") o'z WiFi tarmog'ingizni tanlang va parolini kiriting.
4. Server manzili va token maydonlari — odatda standart qiymatlar bilan qoldirsa bo'ladi (agar boshqacha ko'rsatilmagan bo'lsa).
5. "Saqlash" tugmasini bosing — qurilma avtomatik qayta ulanadi.

**Agar 10 daqiqa ichida hech kim sozlamasa**: qurilma avtomatik bitta ulanish urinishini qiladi, muvaffaqiyatsiz bo'lsa AP'ni yana ochadi — bu tsikl WiFi ulanguncha yoki kimdir sozlaguncha davom etadi. Qurilma hech qachon "abadiy o'lik" holatga tushmaydi.

**Agar qurilma allaqachon sozlangan bo'lsa-yu, router vaqtincha o'chgan bo'lsa** (masalan svet o'chib-yonganda): portal umuman ochilmaydi — qurilma fonda har 15 soniyada avtomatik qayta ulanishga urinadi, router yonishi bilan o'zi tuzaladi.

**WiFi'ni qayta sozlash kerak bo'lsa** (masalan qurilma boshqa binoga ko'chirilsa): BOOT tugmasini ~3 soniya bosib turing — saqlangan WiFi ma'lumotlari tozalanadi va portal qayta ochiladi.

## 5. Muhim simlash eslatmalari

- **LCD (I2C)**: SDA=GPIO21, SCL=GPIO22 (standart, `-DLCD_SDA`/`-DLCD_SCL` bilan o'zgartirish mumkin)
- **RS-485 leaf shinasi**: RO→GPIO32, DI→GPIO33, DE+RE→GPIO25 (barcha leaf turlarida bir xil)
- **Elektr hisoblagich (DLMS) RS-485**: alohida shina — RX=16, TX=17, DE=4 (leaf shinasi bilan chalkashtirmang)
- **Tuproq namligi ADC**: GPIO34 (kalibrovka: `-DSOIL_ADC_DRY`/`-DSOIL_ADC_WET` — havoda va suvda o'lchab kiriting)
- **ADS1115 (suv/gaz)**: I2C, standart manzil 0x48

## 6. Muammolarni bartaraf etish

| Muammo | Tekshirish |
|---|---|
| LCD hech narsa ko'rsatmayapti | Simlash to'g'riligini, I2C manzilini tekshiring; boot logida "LCD... OK" yoki "FAIL" ko'rinadi |
| Qurilma backend'da ko'rinmayapti | Serial monitor orqali WiFi ulanganini va server manzilini tekshiring |
| Elektr hisoblagich o'qilmayapti | RS-485 A/B simlari to'g'ri ulanganini, hisoblagich portida DLMS/HDLC yoqilganini tekshiring (faqat TE71/TE73 qo'llab-quvvatlanadi) |
| Sensor doim "0" yoki bir xil qiymat ko'rsatadi | Bu endi avtomatik "xato" deb belgilanadi (sensor uzilgan/nosoz) — jismoniy ulanishni tekshiring |

## 7. Batafsil arxitektura

RS-485 bino-ichi shinasi, DLMS protokoli va backend integratsiyasi haqida to'liq ma'lumot uchun repo ildizidagi `SYSTEM_ARCHITECTURE.md` faylining 3-bo'limiga qarang.
