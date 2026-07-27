"""lora_decoder.py — LoRa ikkilik va text paketlarini tahlil qilish va dekodlash.

`iot/include/lora_packet.h` (MESH v2) C++ strukturalari bilan 100% mos keladi.

Mesh v2 umumiy header (12 bayt, ochiq):
    [pkt_type(1)][mac(6)][flags(1)][seq(4, little-endian)]
CRC16-CCITT: flags baytining TTL bitlari (0x70) 0 deb hisoblanadi —
relay TTL ni o'zgartirganda CRC buzilmasligi uchun.

Eslatma: shifrlangan (LORA_ENCRYPT) paketlarda payload+CRC shifrlangan bo'ladi;
header baribir ochiq, shuning uchun type/mac/seq har doim dekodlanadi,
CRC esa faqat shifrlanmagan paketlarda mos keladi.
"""
import struct

LORA_TTL_MASK = 0x70
LORA_OFF_FLAGS = 7
HDR_FMT = "<B6sBI"          # pkt_type, mac, flags, seq
HDR_LEN = 12

PKT_UPLINK = 0x01
PKT_DOWNLINK = 0x02
PKT_UPLINK_SOIL = 0x03
PKT_UPLINK_SOUND = 0x04
PKT_UPLINK_WATER = 0x05
PKT_UPLINK_GAS = 0x06
PKT_ACK = 0x08


def crc16_ccitt(data: bytes) -> int:
    """CRC16-CCITT (lora_packet.h lora_crc16 bilan mos — TTL bitlari maskalanadi)."""
    crc = 0xFFFF
    for i, byte in enumerate(data):
        if i == LORA_OFF_FLAGS:
            byte &= ~LORA_TTL_MASK & 0xFF
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def _hdr(data: bytes) -> tuple[str, int, int, int]:
    """Umumiy headerni ochish: (mac_str, flags, seq, ttl)."""
    _, mac_b, flags, seq = struct.unpack(HDR_FMT, data[:HDR_LEN])
    mac_str = ":".join(f"{b:02X}" for b in mac_b)
    ttl = (flags & LORA_TTL_MASK) >> 4
    return mac_str, flags, seq, ttl


class LoRaPacketDecoder:
    """ESP32 LoRa MESH v2 paketlarini dekodlash xizmati."""

    @staticmethod
    def parse_hex_string(hex_str: str) -> bytes | None:
        """Hex matnini ikkilik baytlarga aylantiradi."""
        try:
            clean_hex = hex_str.strip().replace(" ", "").replace("0x", "")
            return bytes.fromhex(clean_hex)
        except Exception:
            return None

    @classmethod
    def decode_packet(cls, data: bytes) -> dict | None:
        """LoRa mesh v2 paketlarini dekodlaydi."""
        if not data or len(data) < HDR_LEN + 2:
            return None

        pkt_type = data[0]

        try:
            mac_str, flags, seq, ttl = _hdr(data)
        except Exception:
            return None

        def base(type_name: str, total: int) -> dict:
            crc_rx = data[total - 2] | (data[total - 1] << 8)
            crc_calc = crc16_ccitt(data[:total - 2])
            return {
                "valid_crc": (crc_rx == crc_calc),
                "type": type_name,
                "type_code": pkt_type,
                "mac": mac_str,
                "flags": flags,
                "seq": seq,
                "ttl": ttl,
                "crc_rx": hex(crc_rx),
                "crc_calc": hex(crc_calc),
            }

        # ── PKT_UPLINK_SOIL (0x03) ── 16 bayt
        if pkt_type == PKT_UPLINK_SOIL and len(data) >= 16:
            try:
                (humidity_raw,) = struct.unpack("<h", data[12:14])
                res = base("SOIL_UPLINK", 16)
                res["test_mode"] = bool(flags & 0x01)
                res["humidity_pct"] = humidity_raw / 100.0
                return res
            except Exception:
                return None

        # ── PKT_UPLINK_SOUND (0x04) ── 16 bayt
        if pkt_type == PKT_UPLINK_SOUND and len(data) >= 16:
            try:
                (level_raw,) = struct.unpack("<h", data[12:14])
                res = base("SOUND_UPLINK", 16)
                res["test_mode"] = bool(flags & 0x01)
                res["level_pct"] = level_raw / 100.0
                return res
            except Exception:
                return None

        # ── PKT_UPLINK_WATER (0x05) ── 26 bayt
        if pkt_type == PKT_UPLINK_WATER and len(data) >= 26:
            try:
                p_bottom, p_top, flow, volume, temp = struct.unpack("<hhhih", data[12:24])
                res = base("WATER_UPLINK", 26)
                res["test_mode"] = bool(flags & 0x01)
                res["p_bottom_bar"] = p_bottom / 1000.0
                res["p_top_bar"] = p_top / 1000.0
                res["flow_lmin"] = flow / 100.0
                res["volume_m3"] = volume / 1000.0
                res["temp_c"] = temp / 100.0
                return res
            except Exception:
                return None

        # ── PKT_UPLINK_GAS (0x06) ── 24 bayt
        if pkt_type == PKT_UPLINK_GAS and len(data) >= 24:
            try:
                pressure, flow, volume, temp = struct.unpack("<hhih", data[12:22])
                res = base("GAS_UPLINK", 24)
                res["test_mode"] = bool(flags & 0x01)
                res["pressure_bar"] = pressure / 1000.0
                res["flow_m3h"] = flow / 1000.0
                res["volume_m3"] = volume / 1000.0
                res["temp_c"] = temp / 100.0
                return res
            except Exception:
                return None

        # ── PKT_UPLINK Electricity (0x01) ── 51 bayt
        if pkt_type == PKT_UPLINK and len(data) >= 51:
            try:
                fmt = "<13s" + "h" * 6 + "i" + "h" + "i" + "h"
                unpacked = struct.unpack(fmt, data[12:49])
                serial_b = unpacked[0]
                v_l1, v_l2, v_l3 = unpacked[1], unpacked[2], unpacked[3]
                i_l1, i_l2, i_l3 = unpacked[4], unpacked[5], unpacked[6]
                power_w = unpacked[7]
                freq_chz = unpacked[8]
                energy_wh = unpacked[9]
                pf_pct = unpacked[10]

                serial_str = serial_b.decode("utf-8", errors="ignore").rstrip("\x00")
                res = base("ELECTRICITY_UPLINK", 51)
                res["is_te73"] = bool(flags & 0x01)
                res["test_mode"] = bool(flags & 0x02)
                res["meter_serial"] = serial_str
                res["voltage_v"] = {"l1": v_l1 / 100.0, "l2": v_l2 / 100.0, "l3": v_l3 / 100.0}
                res["current_a"] = {"l1": i_l1 / 1000.0, "l2": i_l2 / 1000.0, "l3": i_l3 / 1000.0}
                res["power_w"] = power_w
                res["power_kw"] = power_w / 1000.0
                res["frequency_hz"] = freq_chz / 100.0
                res["energy_kwh"] = energy_wh / 1000.0
                res["power_factor"] = pf_pct / 100.0
                return res
            except Exception:
                return None

        # ── PKT_DOWNLINK (0x02) ── 15 bayt
        if pkt_type == PKT_DOWNLINK and len(data) >= 15:
            try:
                relay_cmd = data[12]
                res = base("DOWNLINK", 15)
                res["relay_cmd"] = relay_cmd
                res["relay_action"] = {0: "none", 1: "relay_off", 2: "relay_on"}.get(
                    relay_cmd, f"unknown({relay_cmd})"
                )
                return res
            except Exception:
                return None

        # ── PKT_ACK (0x08) ── 15 bayt
        if pkt_type == PKT_ACK and len(data) >= 15:
            try:
                ack_type = data[12]
                res = base("ACK", 15)
                res["ack_type"] = ack_type
                res["ack_type_name"] = {
                    PKT_UPLINK: "ELECTRICITY_UPLINK",
                    PKT_DOWNLINK: "DOWNLINK",
                    PKT_UPLINK_SOIL: "SOIL_UPLINK",
                    PKT_UPLINK_SOUND: "SOUND_UPLINK",
                    PKT_UPLINK_WATER: "WATER_UPLINK",
                    PKT_UPLINK_GAS: "GAS_UPLINK",
                }.get(ack_type, f"unknown(0x{ack_type:02X})")
                return res
            except Exception:
                return None

        return None

    @classmethod
    def parse_serial_log_line(cls, line: str) -> dict | None:
        """Serial monitor matnidan LoRa RSSI/SNR va payload ma'lumotlarini ajratib oladi."""
        if not line:
            return None

        res = {}
        if "RSSI" in line.upper():
            import re
            m = re.search(r"RSSI[:=]?\s*(-?\d+)", line, re.IGNORECASE)
            if m:
                res["rssi"] = int(m.group(1))

        if "SNR" in line.upper():
            import re
            m = re.search(r"SNR[:=]?\s*(-?\d+\.?\d*)", line, re.IGNORECASE)
            if m:
                res["snr"] = float(m.group(1))

        if "[" in line and "]" in line:
            import re
            m = re.search(r"\[(?:HEX|PKT|PAYLOAD)\]\s*([0-9A-Fa-f\s]{24,})", line)
            if m:
                raw_bytes = cls.parse_hex_string(m.group(1))
                if raw_bytes:
                    decoded = cls.decode_packet(raw_bytes)
                    if decoded:
                        res["packet"] = decoded

        return res if res else None
