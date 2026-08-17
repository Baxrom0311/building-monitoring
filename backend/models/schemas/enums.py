from enum import StrEnum


class UtilityType(StrEnum):
    electricity = "electricity"
    water = "water"
    gas = "gas"
    soil = "soil"
    sound = "sound"
    heating = "heating"
    gateway = "gateway"
    air_quality = "air_quality"


class MeasurementRole(StrEnum):
    electricity_main_meter = "electricity_main_meter"
    water_pressure_bottom = "water_pressure_bottom"
    water_pressure_top = "water_pressure_top"
    gas_pressure_main = "gas_pressure_main"
    water_flow = "water_flow"
    gas_flow = "gas_flow"
    soil_moisture = "soil_moisture"
    sound_level = "sound_level"
    heating_supply_temp = "heating_supply_temp"
    heating_return_temp = "heating_return_temp"


class DeviceRole(StrEnum):
    electricity_node = "electricity_node"
    water_node = "water_node"
    gas_node = "gas_node"
    soil_node = "soil_node"
    soil_outdoor = "soil_outdoor"
    soil_basement = "soil_basement"
    sound_node = "sound_node"
    sound_air = "sound_air"
    heating_node = "heating_node"


class FirmwareMode(StrEnum):
    electricity = "electricity"
    water = "water"
    gas = "gas"
    soil = "soil"
    sound = "sound"
    heating = "heating"
    lora_gateway = "lora_gateway"
    auto = "auto"


class ChatProvider(StrEnum):
    gemini = "gemini"
    deepseek = "deepseek"


class ChatRole(StrEnum):
    user = "user"
    model = "model"


class BuildingUtilityStatus(StrEnum):
    active = "active"
    disabled = "disabled"
    maintenance = "maintenance"
