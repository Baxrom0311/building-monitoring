"""ESP32 Studio — Professional Firmware Flasher & Monitor.

Toshelectroapparat loyihasi uchun ESP32 mikrokontrollerlariga firmware
yuklash, serial monitoring va LoRa paket tahlili dasturi.
"""
import html
import os
import sys
import tempfile
from datetime import datetime

from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QComboBox, QLineEdit, QTextEdit, QProgressBar,
    QFrame, QMessageBox, QTabWidget, QCheckBox, QFileDialog, QSplitter,
    QTableWidget, QTableWidgetItem, QHeaderView, QRadioButton, QButtonGroup,
)
from PyQt6.QtCore import Qt, QTimer, QSettings
from PyQt6.QtGui import QFont, QTextCursor

from controllers.flash_controller import FlashController
from services.esptool_service import EsptoolService
from services.api_client import ApiClient
from services.lora_decoder import LoRaPacketDecoder
from services.tool_installer import ToolInstallerService
from .styles import DARK_THEME

# Sensor turlari ro'yxati
SENSOR_TYPES = [
    ("all",         "Barchasi"),
    ("electricity", "Elektr hisoblagich"),
    ("soil",        "Tuproq namligi"),
    ("sound",       "Ovoz sensori"),
    ("water",       "Suv bosimi"),
    ("gas",         "Gaz bosimi"),
    ("lora_gateway","LoRa Gateway"),
]

DEFAULT_SERVER = "https://ss.boos.uz"


class ESP32StudioWindow(QMainWindow):
    """ESP32 Studio asosiy oynasi."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("ESP32 Studio — Toshelectroapparat")
        self.setMinimumSize(1120, 740)
        self.resize(1300, 840)

        self.settings = QSettings("Toshelectroapparat", "ESP32Studio")
        self.controller = FlashController()
        self._serial_workers = {}
        self._firmware_list = []
        self._selected_firmware = None
        self._download_path = None

        # API Client
        server = self.settings.value("server_url", DEFAULT_SERVER)
        self.api = ApiClient(server)

        # Firmware cache directory
        self._app_dir = ToolInstallerService.get_app_dir()
        self._cache_dir = os.path.join(self._app_dir, "firmware_cache")
        os.makedirs(self._cache_dir, exist_ok=True)

        self._setup_ui()
        self._refresh_ports()

        # Auto-login if credentials saved
        saved_user = self.settings.value("login_username", "")
        saved_pass = self.settings.value("login_password", "")
        if saved_user and saved_pass:
            QTimer.singleShot(300, lambda: self._do_login(saved_user, saved_pass))

    # ══════════════════════════════════════════════════════════════════════
    # UI Setup
    # ══════════════════════════════════════════════════════════════════════

    def _setup_ui(self):
        self.setStyleSheet(DARK_THEME)

        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(12, 12, 12, 12)
        main_layout.setSpacing(10)

        # ── Header Bar ──
        header = QFrame()
        header.setObjectName("card")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(16, 10, 16, 10)

        title_box = QVBoxLayout()
        title_box.setSpacing(2)
        lbl_title = QLabel("ESP32 Studio")
        lbl_title.setObjectName("brandTitle")
        lbl_sub = QLabel("Toshelectroapparat — Firmware Flasher & Monitor")
        lbl_sub.setObjectName("brandSubtitle")
        title_box.addWidget(lbl_title)
        title_box.addWidget(lbl_sub)
        header_layout.addLayout(title_box)
        header_layout.addStretch()

        # Server status
        self.lbl_server = QLabel("Server: tekshirilmoqda...")
        self.lbl_server.setStyleSheet("color: #fbbf24; font-weight: 600; font-size: 12px;")
        header_layout.addWidget(self.lbl_server)

        btn_refresh = QPushButton("Portlarni yangilash")
        btn_refresh.clicked.connect(self._refresh_ports)
        header_layout.addWidget(btn_refresh)

        main_layout.addWidget(header)

        # ── Tabs ──
        self.tabs = QTabWidget()
        main_layout.addWidget(self.tabs, 1)

        self.tabs.addTab(self._create_flasher_tab(), "Firmware Flasher")
        self.tabs.addTab(self._create_monitor_tab(), "Serial Monitor")
        self.tabs.addTab(self._create_inspector_tab(), "LoRa Inspector")
        self.tabs.addTab(self._create_settings_tab(), "Sozlamalar")

        # Status bar
        self.lbl_status = QLabel("Tayyor")
        self.lbl_status.setStyleSheet("color: #94a3b8; font-weight: 600; padding: 4px 8px;")
        self.statusBar().addWidget(self.lbl_status)

    # ══════════════════════════════════════════════════════════════════════
    # Tab 1: Firmware Flasher
    # ══════════════════════════════════════════════════════════════════════

    def _create_flasher_tab(self) -> QWidget:
        widget = QWidget()
        layout = QHBoxLayout(widget)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(10)

        # ── Chap panel — Konfiguratsiya ──
        left = QFrame()
        left.setObjectName("card")
        left.setFixedWidth(380)
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(16, 16, 16, 16)
        left_layout.setSpacing(10)

        # USB Port
        left_layout.addWidget(self._section("USB Port"))
        port_row = QHBoxLayout()
        self.combo_port = QComboBox()
        port_row.addWidget(self.combo_port, 1)
        btn_chip = QPushButton("Chip Info")
        btn_chip.setFixedWidth(80)
        btn_chip.clicked.connect(self._on_chip_info)
        port_row.addWidget(btn_chip)
        left_layout.addLayout(port_row)

        # Firmware manbai
        left_layout.addWidget(self._section("Firmware manbai"))
        src_row = QHBoxLayout()
        self.rb_server = QRadioButton("Serverdan")
        self.rb_local = QRadioButton("Lokal fayl")
        self.rb_server.setChecked(True)
        src_group = QButtonGroup(self)
        src_group.addButton(self.rb_server)
        src_group.addButton(self.rb_local)
        self.rb_server.toggled.connect(self._on_source_changed)
        src_row.addWidget(self.rb_server)
        src_row.addWidget(self.rb_local)
        src_row.addStretch()
        left_layout.addLayout(src_row)

        # Server filter (sensor turi)
        self.server_filter_widget = QWidget()
        sf_layout = QVBoxLayout(self.server_filter_widget)
        sf_layout.setContentsMargins(0, 0, 0, 0)
        sf_layout.setSpacing(6)
        sf_layout.addWidget(self._small_label("Sensor turi:"))
        filter_row = QHBoxLayout()
        self.combo_sensor_filter = QComboBox()
        for key, label in SENSOR_TYPES:
            self.combo_sensor_filter.addItem(label, key)
        self.combo_sensor_filter.currentIndexChanged.connect(self._apply_firmware_filter)
        filter_row.addWidget(self.combo_sensor_filter, 1)
        btn_refresh_fw = QPushButton("Yangilash")
        btn_refresh_fw.setFixedWidth(80)
        btn_refresh_fw.clicked.connect(self._fetch_firmware_list)
        filter_row.addWidget(btn_refresh_fw)
        sf_layout.addLayout(filter_row)
        left_layout.addWidget(self.server_filter_widget)

        # Local file
        self.local_file_widget = QWidget()
        lf_layout = QVBoxLayout(self.local_file_widget)
        lf_layout.setContentsMargins(0, 0, 0, 0)
        lf_layout.setSpacing(6)
        lf_layout.addWidget(self._small_label("Firmware fayl (.bin):"))
        file_row = QHBoxLayout()
        self.edit_bin_path = QLineEdit()
        self.edit_bin_path.setPlaceholderText("firmware.bin yo'lini tanlang...")
        btn_browse = QPushButton("Tanlash")
        btn_browse.setFixedWidth(80)
        btn_browse.clicked.connect(self._on_browse_bin)
        file_row.addWidget(self.edit_bin_path, 1)
        file_row.addWidget(btn_browse)
        lf_layout.addLayout(file_row)
        self.local_file_widget.setVisible(False)
        left_layout.addWidget(self.local_file_widget)

        # Tanlangan firmware ma'lumoti
        left_layout.addWidget(self._section("Tanlangan firmware"))
        self.lbl_fw_info = QLabel("Firmware tanlanmagan")
        self.lbl_fw_info.setStyleSheet("color: #94a3b8; font-size: 12px;")
        self.lbl_fw_info.setWordWrap(True)
        left_layout.addWidget(self.lbl_fw_info)

        # Flash sozlamalari
        left_layout.addWidget(self._section("Flash sozlamalari"))
        left_layout.addWidget(self._small_label("Tezlik (Baud):"))
        self.combo_baud = QComboBox()
        self.combo_baud.addItems(["460800", "921600", "230400", "115200"])
        left_layout.addWidget(self.combo_baud)

        self.chk_erase = QCheckBox("Oldin sozlamalarni tozalash (NVS)")
        left_layout.addWidget(self.chk_erase)

        left_layout.addStretch()

        # Flash tugmasi
        self.btn_flash = QPushButton("FLASH QILISH")
        self.btn_flash.setObjectName("btnPrimary")
        self.btn_flash.setMinimumHeight(48)
        self.btn_flash.setStyleSheet("""
            QPushButton {
                background-color: #0284c7;
                color: #ffffff;
                border: 1px solid #0369a1;
                font-weight: 800;
                font-size: 15px;
                border-radius: 10px;
            }
            QPushButton:hover { background-color: #0369a1; }
            QPushButton:disabled { background-color: #1e293b; color: #475569; border-color: #334155; }
        """)
        self.btn_flash.clicked.connect(self._on_flash)
        left_layout.addWidget(self.btn_flash)

        self.btn_erase = QPushButton("Sozlamalarni tozalash (NVS)")
        self.btn_erase.setObjectName("btnDanger")
        self.btn_erase.clicked.connect(self._on_erase_only)
        left_layout.addWidget(self.btn_erase)

        layout.addWidget(left)

        # ── O'ng panel — Firmware jadvali va Terminal ──
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(8)

        # Firmware jadvali
        fw_card = QFrame()
        fw_card.setObjectName("card")
        fw_card_layout = QVBoxLayout(fw_card)
        fw_card_layout.setContentsMargins(12, 12, 12, 12)
        fw_card_layout.setSpacing(6)

        fw_header = QHBoxLayout()
        fw_header.addWidget(self._section("Mavjud firmwarelar"))
        self.lbl_fw_count = QLabel("")
        self.lbl_fw_count.setStyleSheet("color: #64748b; font-size: 12px;")
        fw_header.addStretch()
        fw_header.addWidget(self.lbl_fw_count)
        fw_card_layout.addLayout(fw_header)

        self.table_fw = QTableWidget(0, 7)
        self.table_fw.setHorizontalHeaderLabels([
            "Versiya", "Turi", "Rejim", "Roli", "Hajmi", "Sana", "Holati"
        ])
        self.table_fw.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table_fw.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table_fw.setSelectionMode(QTableWidget.SelectionMode.SingleSelection)
        self.table_fw.setAlternatingRowColors(True)
        self.table_fw.setStyleSheet("""
            QTableWidget {
                background-color: #020617;
                border: 1px solid #1e293b;
                border-radius: 6px;
                gridline-color: #1e293b;
                font-size: 12px;
            }
            QTableWidget::item { padding: 4px 8px; }
            QTableWidget::item:selected {
                background-color: #0c4a6e;
                color: #38bdf8;
            }
            QHeaderView::section {
                background-color: #0f172a;
                color: #94a3b8;
                border: 1px solid #1e293b;
                padding: 6px;
                font-weight: 700;
                font-size: 11px;
            }
            QTableWidget::item:alternate { background-color: #0a0f1a; }
        """)
        self.table_fw.selectionModel().selectionChanged.connect(self._on_fw_selected)
        fw_card_layout.addWidget(self.table_fw, 1)

        right_layout.addWidget(fw_card, 1)

        # Terminal va Progress
        term_card = QFrame()
        term_card.setObjectName("card")
        term_card_layout = QVBoxLayout(term_card)
        term_card_layout.setContentsMargins(12, 12, 12, 12)
        term_card_layout.setSpacing(6)

        term_card_layout.addWidget(self._section("Terminal"))

        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        term_card_layout.addWidget(self.progress_bar)

        self.term_flash = QTextEdit()
        self.term_flash.setObjectName("terminalOutput")
        self.term_flash.setReadOnly(True)
        self.term_flash.setMinimumHeight(140)
        term_card_layout.addWidget(self.term_flash, 1)

        right_layout.addWidget(term_card, 1)

        layout.addWidget(right, 1)
        return widget

    # ══════════════════════════════════════════════════════════════════════
    # Tab 2: Dual Serial Monitor
    # ══════════════════════════════════════════════════════════════════════

    def _create_monitor_tab(self) -> QWidget:
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(8)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        self.mon1_widget = self._create_monitor_box("Port 1 (Gateway)", 0)
        splitter.addWidget(self.mon1_widget)

        self.mon2_widget = self._create_monitor_box("Port 2 (Node)", 1)
        splitter.addWidget(self.mon2_widget)

        layout.addWidget(splitter, 1)
        return widget

    def _create_monitor_box(self, title: str, idx: int) -> QWidget:
        card = QFrame()
        card.setObjectName("card")
        layout = QVBoxLayout(card)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(6)

        layout.addWidget(self._section(title))

        ctrl_row = QHBoxLayout()
        combo_port = QComboBox()
        combo_baud = QComboBox()
        combo_baud.addItems(["115200", "9600", "57600", "230400", "460800"])
        btn_conn = QPushButton("Boshlash")
        btn_conn.setObjectName("btnSuccess")
        btn_clear = QPushButton("Tozalash")
        btn_save = QPushButton("Saqlash")

        ctrl_row.addWidget(combo_port, 1)
        ctrl_row.addWidget(combo_baud)
        ctrl_row.addWidget(btn_conn)
        ctrl_row.addWidget(btn_clear)
        ctrl_row.addWidget(btn_save)
        layout.addLayout(ctrl_row)

        term = QTextEdit()
        term.setObjectName("terminalOutput")
        term.setReadOnly(True)
        layout.addWidget(term, 1)

        cmd_row = QHBoxLayout()
        edit_cmd = QLineEdit()
        edit_cmd.setPlaceholderText("Buyruq (masalan AT+GMR)...")

        combo_preset = QComboBox()
        combo_preset.addItems(["AT Buyruqlar...", "AT", "AT+GMR", "AT+CONFIG?", "AT+WIFI?", "AT+LORA?", "AT+RST", "AT+REBOOT"])
        combo_preset.currentIndexChanged.connect(
            lambda i: (edit_cmd.setText(combo_preset.itemText(i)), combo_preset.setCurrentIndex(0)) if i > 0 else None
        )

        btn_send = QPushButton("Yuborish")
        cmd_row.addWidget(edit_cmd, 1)
        cmd_row.addWidget(combo_preset)
        cmd_row.addWidget(btn_send)
        layout.addLayout(cmd_row)

        setattr(self, f"mon_port_{idx}", combo_port)
        setattr(self, f"mon_baud_{idx}", combo_baud)
        setattr(self, f"mon_btn_{idx}", btn_conn)
        setattr(self, f"mon_term_{idx}", term)
        setattr(self, f"mon_cmd_{idx}", edit_cmd)

        btn_conn.clicked.connect(lambda: self._toggle_monitor(idx))
        btn_clear.clicked.connect(term.clear)
        btn_save.clicked.connect(lambda: self._save_log(term))
        btn_send.clicked.connect(lambda: self._send_cmd(idx))
        edit_cmd.returnPressed.connect(lambda: self._send_cmd(idx))

        return card

    # ══════════════════════════════════════════════════════════════════════
    # Tab 3: LoRa Inspector
    # ══════════════════════════════════════════════════════════════════════

    def _create_inspector_tab(self) -> QWidget:
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(8)

        # Inspector Status Bar Header
        status_card = QFrame()
        status_card.setObjectName("card")
        sc_layout = QHBoxLayout(status_card)
        sc_layout.setContentsMargins(14, 8, 14, 8)

        self.lbl_lora_status_icon = QLabel("●")
        self.lbl_lora_status_icon.setStyleSheet("color: #22c55e; font-size: 16px;")
        self.lbl_lora_status_title = QLabel("LoRa MESH v2 Inspector (Faol)")
        self.lbl_lora_status_title.setStyleSheet("color: #f8fafc; font-weight: 800; font-size: 13px;")

        sc_layout.addWidget(self.lbl_lora_status_icon)
        sc_layout.addWidget(self.lbl_lora_status_title)
        sc_layout.addStretch()

        self.lbl_lora_pkt_count = QLabel("Jami paketlar: 0")
        self.lbl_lora_pkt_count.setStyleSheet("color: #94a3b8; font-size: 12px; font-weight: 600;")
        self.lbl_lora_last_time = QLabel("Oxirgi paket: —")
        self.lbl_lora_last_time.setStyleSheet("color: #38bdf8; font-size: 12px; font-weight: 600;")

        btn_fetch_cloud_devices = QPushButton("🌐 Serverdagi Barcha Datchiklarni Skan Qilish")
        btn_fetch_cloud_devices.setStyleSheet("""
            QPushButton {
                background-color: #0369a1;
                color: #ffffff;
                font-weight: 700;
                font-size: 11px;
                padding: 4px 10px;
                border-radius: 6px;
            }
            QPushButton:hover { background-color: #0284c7; }
        """)
        btn_fetch_cloud_devices.clicked.connect(self._on_fetch_server_lora_devices)

        sc_layout.addWidget(btn_fetch_cloud_devices)
        sc_layout.addWidget(QLabel("  |  "))
        sc_layout.addWidget(self.lbl_lora_pkt_count)
        sc_layout.addWidget(QLabel("  |  "))
        sc_layout.addWidget(self.lbl_lora_last_time)
        layout.addWidget(status_card)

        # Metric cards for 5-in-1 utilities
        cards_row = QHBoxLayout()
        self.lbl_card_node = self._metric_card("DATCHIK ID / MAC", "—", cards_row)
        self.lbl_card_type = self._metric_card("PAKET TURI", "—", cards_row)
        self.lbl_card_primary = self._metric_card("ASOSIY O'LCHOV", "0.0", cards_row)
        self.lbl_card_secondary = self._metric_card("OQIM / QUVVAT", "—", cards_row)
        self.lbl_card_cumulative = self._metric_card("ENERGIYA / HAJM", "—", cards_row)
        self.lbl_card_rssi = self._metric_card("RSSI / SNR", "—", cards_row)
        layout.addLayout(cards_row)

        # Packet Log Table
        layout.addWidget(self._section("Qabul qilingan LoRa paketlar tarixi"))
        self.table_lora = QTableWidget(0, 9)
        self.table_lora.setHorizontalHeaderLabels([
            "Vaqt", "Turi", "Datchik / Serial", "Asosiy O'lchov", "Qo'shimcha", "Jami", "TTL/Hop", "RSSI/SNR", "CRC"
        ])
        self.table_lora.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table_lora.setStyleSheet("""
            QTableWidget {
                background-color: #020617;
                border: 1px solid #1e293b;
                border-radius: 6px;
                gridline-color: #1e293b;
            }
            QHeaderView::section {
                background-color: #0f172a;
                color: #94a3b8;
                border: 1px solid #1e293b;
                padding: 6px;
                font-weight: 700;
            }
        """)
        layout.addWidget(self.table_lora, 1)
        self._total_lora_packets = 0

        return widget

    def _metric_card(self, title: str, val: str, parent: QHBoxLayout) -> QLabel:
        card = QFrame()
        card.setObjectName("card")
        l = QVBoxLayout(card)
        l.setContentsMargins(12, 10, 12, 10)
        lbl_t = QLabel(title)
        lbl_t.setStyleSheet("color: #64748b; font-weight: 700; font-size: 10px; letter-spacing: 1px;")
        lbl_v = QLabel(val)
        lbl_v.setStyleSheet("color: #38bdf8; font-weight: 900; font-size: 17px;")
        l.addWidget(lbl_t)
        l.addWidget(lbl_v)
        parent.addWidget(card, 1)
        return lbl_v

    # ══════════════════════════════════════════════════════════════════════
    # Tab 4: Sozlamalar
    # ══════════════════════════════════════════════════════════════════════

    def _create_settings_tab(self) -> QWidget:
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(10)

        # ── Login kartasi ──
        login_card = QFrame()
        login_card.setObjectName("card")
        login_card.setMaximumWidth(500)
        lc = QVBoxLayout(login_card)
        lc.setContentsMargins(20, 20, 20, 20)
        lc.setSpacing(10)

        lc.addWidget(self._section("Server ulanishi"))

        lc.addWidget(self._small_label("Server URL:"))
        self.edit_server = QLineEdit(self.settings.value("server_url", DEFAULT_SERVER))
        lc.addWidget(self.edit_server)

        lc.addWidget(self._small_label("Login:"))
        self.edit_username = QLineEdit(self.settings.value("login_username", ""))
        self.edit_username.setPlaceholderText("Foydalanuvchi nomi")
        lc.addWidget(self.edit_username)

        lc.addWidget(self._small_label("Parol:"))
        self.edit_password = QLineEdit(self.settings.value("login_password", ""))
        self.edit_password.setPlaceholderText("Parol")
        self.edit_password.setEchoMode(QLineEdit.EchoMode.Password)
        lc.addWidget(self.edit_password)

        self.chk_show_pass = QCheckBox("Parolni ko'rsatish")
        self.chk_show_pass.toggled.connect(
            lambda v: self.edit_password.setEchoMode(
                QLineEdit.EchoMode.Normal if v else QLineEdit.EchoMode.Password
            )
        )
        lc.addWidget(self.chk_show_pass)

        self.lbl_login_status = QLabel("")
        self.lbl_login_status.setStyleSheet("font-size: 12px; font-weight: 600;")
        lc.addWidget(self.lbl_login_status)

        btn_login = QPushButton("Kirish va firmware ro'yxatini yuklash")
        btn_login.setObjectName("btnPrimary")
        btn_login.setMinimumHeight(40)
        btn_login.clicked.connect(self._on_login_clicked)
        lc.addWidget(btn_login)

        lc.addStretch()
        layout.addWidget(login_card)

        # ── Tizim ma'lumotlari ──
        info_card = QFrame()
        info_card.setObjectName("card")
        info_card.setMaximumWidth(500)
        ic = QVBoxLayout(info_card)
        ic.setContentsMargins(20, 20, 20, 20)
        ic.setSpacing(8)

        ic.addWidget(self._section("Tizim"))
        pio_text = self.controller.pio_path or "Topilmadi"
        proj_text = self.controller.project_root or "Topilmadi"
        ic.addWidget(self._small_label(f"PlatformIO: {pio_text}"))
        ic.addWidget(self._small_label(f"Loyiha: {proj_text}"))
        ic.addWidget(self._small_label(f"Firmware kesh: {self._cache_dir}"))

        layout.addWidget(info_card)
        layout.addStretch()
        return widget

    # ══════════════════════════════════════════════════════════════════════
    # UI Helpers
    # ══════════════════════════════════════════════════════════════════════

    def _section(self, text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setObjectName("sectionTitle")
        return lbl

    def _small_label(self, text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setStyleSheet("color: #64748b; font-size: 12px; font-weight: 600;")
        return lbl

    def _save_setting(self, key: str, value):
        self.settings.setValue(key, value)

    # ══════════════════════════════════════════════════════════════════════
    # Port Management
    # ══════════════════════════════════════════════════════════════════════

    def _refresh_ports(self):
        ports = EsptoolService.list_serial_ports()
        combos = [self.combo_port]
        for i in range(2):
            combos.append(getattr(self, f"mon_port_{i}"))

        for c in combos:
            c.clear()
            if not ports:
                c.addItem("Port topilmadi", "")
            else:
                for p in ports:
                    c.addItem(p["display_name"], p["device"])

        # Auto-select known ports
        for i in range(self.combo_port.count()):
            val = self.combo_port.itemData(i) or ""
            if "usbserial-10" in val:
                self.mon_port_0.setCurrentIndex(i)
            elif "usbserial-110" in val:
                self.mon_port_1.setCurrentIndex(i)

        self.lbl_status.setText(f"{len(ports)} ta USB port topildi")

    # ══════════════════════════════════════════════════════════════════════
    # Server / Firmware
    # ══════════════════════════════════════════════════════════════════════

    def _on_login_clicked(self):
        server = self.edit_server.text().strip() or DEFAULT_SERVER
        username = self.edit_username.text().strip()
        password = self.edit_password.text()
        if not username or not password:
            QMessageBox.warning(self, "Xato", "Login va parolni kiriting!")
            return
        self.settings.setValue("server_url", server)
        self.settings.setValue("login_username", username)
        self.settings.setValue("login_password", password)
        self.api = ApiClient(server)
        self._do_login(username, password)

    def _do_login(self, username: str, password: str):
        self.lbl_server.setText("Server: kirilmoqda...")
        self.lbl_server.setStyleSheet("color: #fbbf24; font-weight: 600; font-size: 12px;")
        if hasattr(self, "lbl_login_status"):
            self.lbl_login_status.setText("Kirilmoqda...")
            self.lbl_login_status.setStyleSheet("color: #fbbf24; font-size: 12px; font-weight: 600;")

        self.controller.login(
            self.api, username, password,
            success_cb=self._on_login_success,
            error_cb=self._on_login_error,
        )

    def _on_login_success(self, data: dict):
        user = data.get("user", {})
        name = user.get("username", "?")
        role = user.get("role", "?")
        if hasattr(self, "lbl_login_status"):
            self.lbl_login_status.setText(f"Kirildi: {name} ({role})")
            self.lbl_login_status.setStyleSheet("color: #4ade80; font-size: 12px; font-weight: 600;")
        self.lbl_server.setText(f"Server: {name}")
        self.lbl_server.setStyleSheet("color: #4ade80; font-weight: 600; font-size: 12px;")
        self._fetch_firmware_list()

    def _on_login_error(self, err: str):
        if hasattr(self, "lbl_login_status"):
            self.lbl_login_status.setText(f"Xato: {err}")
            self.lbl_login_status.setStyleSheet("color: #f87171; font-size: 12px; font-weight: 600;")
        self.lbl_server.setText("Server: kirib bo'lmadi")
        self.lbl_server.setStyleSheet("color: #f87171; font-weight: 600; font-size: 12px;")

    def _fetch_firmware_list(self):
        self.lbl_server.setText("Server: yuklanmoqda...")
        self.lbl_server.setStyleSheet("color: #fbbf24; font-weight: 600; font-size: 12px;")
        self.controller.fetch_firmware_list(
            self.api,
            result_cb=self._on_firmware_list,
            error_cb=self._on_firmware_list_error,
        )

    def _on_firmware_list(self, items: list):
        self._firmware_list = items
        self.lbl_server.setText(f"Server: ulangan ({len(items)} firmware)")
        self.lbl_server.setStyleSheet("color: #4ade80; font-weight: 600; font-size: 12px;")
        self._apply_firmware_filter()

    def _on_firmware_list_error(self, err: str):
        self._firmware_list = []
        self.lbl_server.setText("Server: ulanib bo'lmadi")
        self.lbl_server.setStyleSheet("color: #f87171; font-weight: 600; font-size: 12px;")
        self._apply_firmware_filter()

    def _apply_firmware_filter(self):
        filter_key = self.combo_sensor_filter.currentData() or "all"
        filtered = self._firmware_list

        if filter_key != "all":
            filtered = [
                fw for fw in self._firmware_list
                if (fw.get("firmware_mode") == filter_key
                    or fw.get("utility_type") == filter_key)
            ]

        self.table_fw.setRowCount(0)
        for fw in filtered:
            row = self.table_fw.rowCount()
            self.table_fw.insertRow(row)

            version = fw.get("version", "?")
            utility = fw.get("utility_type", "—")
            mode = fw.get("firmware_mode", "—")
            role = fw.get("device_role", "—") or "—"
            size = fw.get("size", 0)
            size_str = f"{size / 1024:.0f} KB" if size else "—"
            uploaded = fw.get("uploaded", 0)
            date_str = datetime.fromtimestamp(uploaded).strftime("%Y-%m-%d") if uploaded else "—"
            active = fw.get("active", False)
            stable = fw.get("is_stable", False)
            status = ""
            if active:
                status += "Aktiv"
            if stable:
                status += " Barqaror" if status else "Barqaror"
            if not status:
                status = "Noaktiv"

            items = [version, utility, mode, role, size_str, date_str, status]
            for col, text in enumerate(items):
                item = QTableWidgetItem(str(text))
                item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsEditable)
                if col == 6:  # Status column color
                    if active:
                        item.setForeground(Qt.GlobalColor.green)
                    else:
                        item.setForeground(Qt.GlobalColor.gray)
                self.table_fw.setItem(row, col, item)

            # Store firmware data in first column item
            self.table_fw.item(row, 0).setData(Qt.ItemDataRole.UserRole, fw)

        count = self.table_fw.rowCount()
        self.lbl_fw_count.setText(f"{count} ta firmware" if count else "Firmware topilmadi")

    def _on_fw_selected(self):
        rows = self.table_fw.selectionModel().selectedRows()
        if not rows:
            self._selected_firmware = None
            self.lbl_fw_info.setText("Firmware tanlanmagan")
            return

        row = rows[0].row()
        item = self.table_fw.item(row, 0)
        fw = item.data(Qt.ItemDataRole.UserRole) if item else None
        if not fw:
            return

        self._selected_firmware = fw
        version = fw.get("version", "?")
        filename = fw.get("filename", "?")
        size = fw.get("size", 0)
        size_str = f"{size / 1024:.0f} KB" if size else "?"
        utility = fw.get("utility_type", "?")
        role = fw.get("device_role", "—") or "—"
        sha = (fw.get("sha256") or "")[:16]
        notes = fw.get("release_notes") or fw.get("notes") or ""

        info = (
            f"Versiya: {version}\n"
            f"Fayl: {filename}\n"
            f"Turi: {utility}  |  Roli: {role}\n"
            f"Hajmi: {size_str}  |  SHA256: {sha}..."
        )
        if notes:
            info += f"\n{notes}"
        self.lbl_fw_info.setText(info)

    def _on_source_changed(self, checked: bool):
        is_server = self.rb_server.isChecked()
        self.server_filter_widget.setVisible(is_server)
        self.local_file_widget.setVisible(not is_server)
        self.table_fw.setVisible(is_server)
        if is_server:
            self.lbl_fw_info.setText("Jadvaldan firmware tanlang")
        else:
            self.lbl_fw_info.setText("Lokal .bin faylni tanlang")
            self._selected_firmware = None

    def _on_browse_bin(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Firmware faylni tanlang", "", "Binary (*.bin);;Barchasi (*)"
        )
        if path:
            self.edit_bin_path.setText(path)
            size_kb = os.path.getsize(path) / 1024
            self.lbl_fw_info.setText(f"Lokal fayl: {os.path.basename(path)}\nHajmi: {size_kb:.0f} KB")

    # ══════════════════════════════════════════════════════════════════════
    # Flash Actions
    # ══════════════════════════════════════════════════════════════════════

    def _on_chip_info(self):
        port = self.combo_port.currentData()
        if not port:
            QMessageBox.warning(self, "Xato", "USB portni tanlang!")
            return
        self.term_flash.append("Chip ma'lumoti tekshirilmoqda...\n")
        self.controller.fetch_chip_info(port, 115200, self._on_chip_info_result)

    def _on_chip_info_result(self, info: dict):
        if info.get("success"):
            self.term_flash.append(f'<span style="color:#4ade80;">Chip: {info.get("chip_type")}</span>')
            self.term_flash.append(f'<span style="color:#4ade80;">MAC: {info.get("mac")}</span>')
            if "flash_size" in info:
                self.term_flash.append(f'<span style="color:#4ade80;">Flash: {info.get("flash_size")}</span>')
        else:
            self.term_flash.append(f'<span style="color:#f87171;">Chip aniqlash xatosi</span>')
            raw = info.get("raw", "")
            if raw:
                self.term_flash.append(raw[:500])

    def _on_flash(self):
        port = self.combo_port.currentData()
        if not port:
            QMessageBox.warning(self, "Xato", "USB portni tanlang!")
            return

        self.term_flash.clear()
        self.progress_bar.setValue(0)

        if self.rb_server.isChecked():
            # Serverdan yuklab olish va flash
            if not self._selected_firmware:
                QMessageBox.warning(self, "Xato", "Jadvaldan firmware tanlang!")
                return
            self._flash_from_server(port)
        else:
            # Lokal fayldan flash
            bin_path = self.edit_bin_path.text().strip()
            if not bin_path or not os.path.exists(bin_path):
                QMessageBox.warning(self, "Xato", "Firmware fayl topilmadi!")
                return
            self._flash_bin(port, bin_path)

    def _flash_from_server(self, port: str):
        """Serverdan yuklab olish va flash qilish."""
        fw = self._selected_firmware
        filename = fw.get("filename", "")
        dest_path = os.path.join(self._cache_dir, filename)

        # Cache tekshirish — allaqachon yuklab olingan bo'lsa qayta yuklamaydi
        expected_size = fw.get("size", 0)
        if os.path.exists(dest_path) and expected_size:
            actual_size = os.path.getsize(dest_path)
            if actual_size == expected_size:
                self._log("Firmware keshdan olinmoqda...", "#38bdf8")
                self._flash_bin(port, dest_path)
                return

        self.btn_flash.setEnabled(False)
        self._log(f"Serverdan yuklab olinmoqda: {filename}...", "#38bdf8")

        self._pending_flash_port = port
        self.controller.download_firmware(
            api=self.api,
            filename=filename,
            dest_path=dest_path,
            log_cb=self._on_flash_log,
            prog_cb=self.progress_bar.setValue,
            finish_cb=self._on_download_finished,
        )

    def _on_download_finished(self, success: bool, result: str):
        if success:
            self._log("Yuklab olindi. Flash boshlanmoqda...", "#4ade80")
            self.progress_bar.setValue(0)
            port = getattr(self, "_pending_flash_port", "")
            if port:
                self._flash_bin(port, result)
            else:
                self.btn_flash.setEnabled(True)
        else:
            self._log(f"Yuklash xatosi: {result}", "#f87171")
            self.btn_flash.setEnabled(True)

    def _flash_bin(self, port: str, bin_path: str):
        """Tayyor bin faylni ESP32 ga yuklash."""
        baud = int(self.combo_baud.currentText())
        erase = self.chk_erase.isChecked()

        self.btn_flash.setEnabled(False)

        ok, msg = self.controller.start_direct_flash(
            port=port,
            bin_path=bin_path,
            baud=baud,
            erase_first=erase,
            log_cb=self._on_flash_log,
            prog_cb=self.progress_bar.setValue,
            finish_cb=self._on_flash_finished,
        )
        if not ok:
            QMessageBox.warning(self, "Xato", msg)
            self.btn_flash.setEnabled(True)

    def _on_flash_log(self, text: str, color: str):
        self.term_flash.append(f'<span style="color:{color};">{html.escape(text)}</span>')
        self.term_flash.moveCursor(QTextCursor.MoveOperation.End)

    def _on_flash_finished(self, success: bool, msg: str):
        self.btn_flash.setEnabled(True)
        if success:
            self._log(f"Muvaffaqiyat: {msg}", "#4ade80")
            self.lbl_status.setText("Firmware yuklandi!")
        else:
            self._log(f"Xato: {msg}", "#f87171")

    def _on_erase_only(self):
        port = self.combo_port.currentData()
        if not port:
            return
        reply = QMessageBox.question(
            self, "Tasdiqlang",
            f"{port} da saqlangan sozlamalar (NVS: WiFi, konfiguratsiya) tozalanadi. Davom etasizmi?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply == QMessageBox.StandardButton.Yes:
            ok, msg = self.controller.start_erase_nvs(
                port=port,
                log_cb=self._on_flash_log,
                finish_cb=self._on_erase_finished,
            )
            if ok:
                self.btn_erase.setEnabled(False)
            else:
                QMessageBox.warning(self, "Xato", msg)

    def _on_erase_finished(self, success: bool, msg: str):
        self.btn_erase.setEnabled(True)
        if success:
            self._log(msg, "#4ade80")
            self.lbl_status.setText("Sozlamalar (NVS) tozalandi")
        else:
            self._log(f"Xato: {msg}", "#f87171")

    def _log(self, text: str, color: str = "#cbd5e1"):
        self.term_flash.append(f'<span style="color:{color};">{text}</span>')
        self.term_flash.moveCursor(QTextCursor.MoveOperation.End)

    # ══════════════════════════════════════════════════════════════════════
    # Serial Monitor
    # ══════════════════════════════════════════════════════════════════════

    def _toggle_monitor(self, idx: int):
        combo_p = getattr(self, f"mon_port_{idx}")
        combo_b = getattr(self, f"mon_baud_{idx}")
        btn = getattr(self, f"mon_btn_{idx}")
        term = getattr(self, f"mon_term_{idx}")

        entry = self._serial_workers.get(idx)
        if entry and entry[1].isRunning():
            # Worker qaysi portda boshlangan bo'lsa — o'sha port bilan to'xtatamiz
            started_port, _worker = entry
            self.controller.stop_serial_monitor(started_port)
            self._serial_workers.pop(idx, None)
            btn.setText("Boshlash")
            btn.setObjectName("btnSuccess")
            term.append('<span style="color:#94a3b8;">[Monitor to\'xtatildi]</span>')
        else:
            port = combo_p.currentData()
            if not port:
                return
            baud = int(combo_b.currentText())
            term.append(f'<span style="color:#94a3b8;">[Ulanmoqda: {port} @ {baud}]</span>')

            def _on_data(p, line):
                ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
                term.append(f'<span style="color:#64748b;">[{ts}]</span> {html.escape(line)}')
                term.moveCursor(QTextCursor.MoveOperation.End)
                # LoRa Inspector parsing
                decoded = LoRaPacketDecoder.parse_serial_log_line(line)
                if decoded:
                    self._update_inspector(decoded)

            def _on_status(p, connected, msg):
                term.append(f'<span style="color:#38bdf8;">[{html.escape(msg)}]</span>')

            worker = self.controller.start_serial_monitor(port, baud, _on_data, _on_status)
            self._serial_workers[idx] = (port, worker)
            btn.setText("To'xtatish")
            btn.setObjectName("btnDanger")

    def _update_inspector(self, info: dict):
        rssi_text = f"{info.get('rssi', '—')} dBm / {info.get('snr', '—')} dB" if "rssi" in info else "—"
        if rssi_text != "—":
            self.lbl_card_rssi.setText(rssi_text)

        pkt = info.get("packet")
        if not pkt:
            return

        self._total_lora_packets = getattr(self, "_total_lora_packets", 0) + 1
        ts = datetime.now().strftime("%H:%M:%S")
        self.lbl_lora_pkt_count.setText(f"Jami paketlar: {self._total_lora_packets}")
        self.lbl_lora_last_time.setText(f"Oxirgi paket: {ts}")

        pkt_type = pkt.get("type", "UNKNOWN")
        node_id = pkt.get("meter_serial") or pkt.get("mac") or "—"
        ttl_hop = f"TTL: {pkt.get('ttl', '—')} (Hop: {pkt.get('hop_count', 0)})"
        crc_status = "OK" if pkt.get("valid_crc") else "CRC XATO"

        type_label = pkt_type
        primary_val = "—"
        sec_val = "—"
        cum_val = "—"
        row_type = pkt_type

        if pkt_type == "ELECTRICITY_UPLINK":
            v1 = pkt["voltage_v"]["l1"]
            i1 = pkt["current_a"]["l1"]
            pw = pkt.get("power_kw", 0.0)
            en = pkt.get("energy_kwh", 0.0)

            type_label = "⚡ ELEKTR"
            primary_val = f"{v1:.1f} V"
            sec_val = f"{i1:.2f} A / {pw:.3f} kW"
            cum_val = f"{en:.2f} kWh"
            row_type = "ELECTRICITY"

        elif pkt_type == "SOIL_UPLINK":
            hum = pkt.get("humidity_pct", 0)
            type_label = "🌱 TUPROQ"
            primary_val = f"{hum:.1f} %"
            sec_val = "Namlik sensori"
            cum_val = "—"
            row_type = "SOIL"

        elif pkt_type == "SOUND_UPLINK":
            lvl = pkt.get("level_pct", 0)
            type_label = "🔊 SHOVQIN"
            primary_val = f"{lvl:.1f} dB"
            sec_val = "Shovqin sensori"
            cum_val = "—"
            row_type = "SOUND"

        elif pkt_type == "WATER_UPLINK":
            p_bot = pkt.get("p_bottom_bar", 0)
            flow = pkt.get("flow_lmin", 0)
            vol = pkt.get("volume_m3", 0)
            type_label = "💧 SUV"
            primary_val = f"{p_bot:.2f} bar"
            sec_val = f"{flow:.2f} L/min"
            cum_val = f"{vol:.3f} m³"
            row_type = "WATER"

        elif pkt_type == "GAS_UPLINK":
            press = pkt.get("pressure_bar", 0)
            flow = pkt.get("flow_m3h", 0)
            vol = pkt.get("volume_m3", 0)
            type_label = "🔥 GAZ"
            primary_val = f"{press:.3f} bar"
            sec_val = f"{flow:.3f} m³/h"
            cum_val = f"{vol:.3f} m³"
            row_type = "GAS"

        # Update Inspector Cards
        self.lbl_card_node.setText(str(node_id))
        self.lbl_card_type.setText(type_label)
        self.lbl_card_primary.setText(primary_val)
        self.lbl_card_secondary.setText(sec_val)
        self.lbl_card_cumulative.setText(cum_val)

        # Append to Table Log
        row = self.table_lora.rowCount()
        self.table_lora.insertRow(row)
        vals = [
            ts,
            row_type,
            str(node_id),
            primary_val,
            sec_val,
            cum_val,
            ttl_hop,
            rssi_text,
            crc_status,
        ]
        for col, txt in enumerate(vals):
            item = QTableWidgetItem(txt)
            if col == 8:
                item.setForeground(Qt.GlobalColor.green if pkt.get("valid_crc") else Qt.GlobalColor.red)
            self.table_lora.setItem(row, col, item)

        self.table_lora.scrollToBottom()

    def _send_cmd(self, idx: int):
        edit = getattr(self, f"mon_cmd_{idx}")
        cmd = edit.text().strip()
        if cmd and idx in self._serial_workers:
            self._serial_workers[idx][1].send_command(cmd)
            term = getattr(self, f"mon_term_{idx}")
            term.append(f'<span style="color:#fbbf24;">>>> {cmd}</span>')
            edit.clear()

    def _on_fetch_server_lora_devices(self):
        self.lbl_lora_status_title.setText("LoRa MESH Inspector — Server Skan Qilinmoqda...")
        self.controller.fetch_server_devices(
            self.api,
            result_cb=self._on_server_devices_received,
            error_cb=self._on_server_devices_error,
        )

    def _on_server_devices_received(self, devices: list):
        self.lbl_lora_status_title.setText(f"LoRa MESH Inspector — Serverda {len(devices)} ta Datchik Topildi")
        self.lbl_lora_pkt_count.setText(f"Server datchiklari: {len(devices)}")
        ts = datetime.now().strftime("%H:%M:%S")
        self.lbl_lora_last_time.setText(f"Skan vaqti: {ts}")

        for dev in devices:
            dev_id = dev.get("device_id") or dev.get("id") or "—"
            util = dev.get("utility_type") or dev.get("meter_type") or "—"
            status = "ONLINE" if dev.get("online") or dev.get("status") == "online" else "OFFLINE"
            rssi = dev.get("rssi")
            snr = dev.get("snr")
            rssi_str = f"{rssi} dBm / {snr} dB" if rssi is not None else "—"
            last_reading = dev.get("last_reading", {})
            primary = "—"
            if isinstance(last_reading, dict) and last_reading:
                v = last_reading.get("v_l1") or last_reading.get("value") or last_reading.get("pressure") or last_reading.get("humidity")
                if v is not None:
                    primary = str(v)

            row = self.table_lora.rowCount()
            self.table_lora.insertRow(row)
            vals = [
                ts,
                str(util).upper(),
                str(dev_id),
                primary,
                status,
                "—",
                "Cloud API",
                rssi_str,
                "OK (Server)",
            ]
            for col, txt in enumerate(vals):
                item = QTableWidgetItem(txt)
                if col == 4:
                    item.setForeground(Qt.GlobalColor.green if status == "ONLINE" else Qt.GlobalColor.gray)
                self.table_lora.setItem(row, col, item)

        self.table_lora.scrollToBottom()

    def _on_server_devices_error(self, err: str):
        self.lbl_lora_status_title.setText("LoRa MESH Inspector — Server Skan Xatosi")
        QMessageBox.warning(self, "Server Xatosi", f"Server datchiklarini olib bo'lmadi: {err}")

    def _save_log(self, term: QTextEdit):
        text = term.toPlainText()
        if not text:
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "Log saqlash", "serial_log.txt", "Text (*.txt);;Log (*.log)"
        )
        if path:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            QMessageBox.information(self, "Saqlandi", f"Log saqlandi: {path}")

    # ══════════════════════════════════════════════════════════════════════
    # Close
    # ══════════════════════════════════════════════════════════════════════

    def closeEvent(self, event):
        self.controller.cancel_flash()
        for idx, (port, worker) in list(self._serial_workers.items()):
            self.controller.stop_serial_monitor(port)
            worker.wait(3000)
        self._serial_workers.clear()
        # Qolgan barcha workerlarni kutamiz (flash, download, chip info, ...)
        self.controller.wait_all(3000)
        event.accept()
