import os
import sys
import struct
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.lora_decoder import LoRaPacketDecoder, crc16_ccitt


def _mk(header_fmt: str, *fields) -> bytes:
    """Paket qurish: body + CRC (TTL-masked)."""
    buf = struct.pack(header_fmt, *fields)
    crc = crc16_ccitt(buf)
    return buf + struct.pack("<H", crc)


def test_crc16_ccitt():
    data = b"123456789"
    crc = crc16_ccitt(data)
    assert isinstance(crc, int)
    assert crc != 0


def test_crc_ttl_masked():
    """TTL bitlari o'zgarsa CRC o'zgarmasligi kerak (relay uchun)."""
    mac = b"\x01\x02\x03\x04\x05\x06"
    body_ttl3 = struct.pack("<B6sBIh", 0x03, mac, 0x30, 42, 8530)  # TTL=3
    body_ttl1 = struct.pack("<B6sBIh", 0x03, mac, 0x10, 42, 8530)  # TTL=1
    assert crc16_ccitt(body_ttl3) == crc16_ccitt(body_ttl1)


def test_decode_soil_uplink():
    mac = b"\x01\x02\x03\x04\x05\x06"
    buf = _mk("<B6sBIh", 0x03, mac, 0x30, 1234, 8530)  # 16 bayt

    res = LoRaPacketDecoder.decode_packet(buf)
    assert res is not None
    assert res["valid_crc"] is True
    assert res["type"] == "SOIL_UPLINK"
    assert res["seq"] == 1234
    assert res["ttl"] == 3
    assert res["humidity_pct"] == 85.30


def test_decode_sound_uplink():
    mac = b"\x0A\x0B\x0C\x0D\x0E\x0F"
    buf = _mk("<B6sBIh", 0x04, mac, 0x31, 5530, 5530)

    res = LoRaPacketDecoder.decode_packet(buf)
    assert res is not None
    assert res["valid_crc"] is True
    assert res["type"] == "SOUND_UPLINK"
    assert res["test_mode"] is True
    assert res["level_pct"] == 55.30


def test_decode_water_uplink():
    mac = b"\xA4\xF0\x0F\x77\x92\x6C"
    buf = _mk("<B6sBIhhhih", 0x05, mac, 0x30, 77, 3200, 1500, 1250, 48250, 1850)  # 26 bayt

    res = LoRaPacketDecoder.decode_packet(buf)
    assert res is not None
    assert res["valid_crc"] is True
    assert res["type"] == "WATER_UPLINK"
    assert res["seq"] == 77
    assert res["p_bottom_bar"] == 3.200
    assert res["p_top_bar"] == 1.500
    assert res["flow_lmin"] == 12.50
    assert res["volume_m3"] == 48.250
    assert res["temp_c"] == 18.50


def test_decode_gas_uplink():
    mac = b"\x11\x22\x33\x44\x55\x66"
    buf = _mk("<B6sBIhhih", 0x06, mac, 0x30, 9, 20, 1500, 1250450, 1850)  # 24 bayt

    res = LoRaPacketDecoder.decode_packet(buf)
    assert res is not None
    assert res["valid_crc"] is True
    assert res["type"] == "GAS_UPLINK"
    assert res["pressure_bar"] == 0.020
    assert res["flow_m3h"] == 1.500
    assert res["volume_m3"] == 1250.450


def test_decode_electricity_uplink():
    mac = b"\x10\x20\x30\x40\x50\x60"
    serial_str = b"TE71_000123\x00\x00"
    fmt = "<B6sBI13s" + "h" * 6 + "i" + "h" + "i" + "h"
    buf = _mk(
        fmt,
        0x01, mac, 0x31, 555, serial_str,
        22000, 22100, 21950, 10500, 10200, 9800,
        2310, 5000, 125000, 98,
    )  # 51 bayt
    assert len(buf) == 51

    res = LoRaPacketDecoder.decode_packet(buf)
    assert res is not None
    assert res["valid_crc"] is True
    assert res["type"] == "ELECTRICITY_UPLINK"
    assert res["seq"] == 555
    assert res["is_te73"] is True
    assert res["meter_serial"] == "TE71_000123"
    assert res["voltage_v"]["l1"] == 220.0
    assert res["current_a"]["l1"] == 10.5
    assert res["energy_kwh"] == 125.0


def test_decode_ack():
    mac = b"\xA4\xF0\x0F\x77\x92\x6C"
    buf = _mk("<B6sBIB", 0x08, mac, 0x30, 77, 0x05)  # 15 bayt

    res = LoRaPacketDecoder.decode_packet(buf)
    assert res is not None
    assert res["valid_crc"] is True
    assert res["type"] == "ACK"
    assert res["seq"] == 77
    assert res["ack_type_name"] == "WATER_UPLINK"


def test_decode_downlink():
    mac = b"\x10\x20\x30\x40\x50\x60"
    buf = _mk("<B6sBIB", 0x02, mac, 0x30, 12, 2)  # 15 bayt

    res = LoRaPacketDecoder.decode_packet(buf)
    assert res is not None
    assert res["valid_crc"] is True
    assert res["type"] == "DOWNLINK"
    assert res["relay_action"] == "relay_on"


def test_bad_crc_flagged():
    mac = b"\x01\x02\x03\x04\x05\x06"
    buf = bytearray(_mk("<B6sBIh", 0x03, mac, 0x30, 1, 5000))
    buf[-1] ^= 0xFF  # CRC ni buzamiz
    res = LoRaPacketDecoder.decode_packet(bytes(buf))
    assert res is not None
    assert res["valid_crc"] is False
