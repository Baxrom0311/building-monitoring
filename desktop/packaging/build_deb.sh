#!/usr/bin/env bash
# ==============================================================================
# ESP32 Studio — Ubuntu / Debian Package Generator (.deb)
# ==============================================================================
set -e

VERSION="1.0.0"
ARCH="amd64"
PKG_NAME="esp32-studio"
BUILD_DIR="build_deb"
DEB_DIR="${BUILD_DIR}/${PKG_NAME}_${VERSION}_${ARCH}"

echo "============================================================"
echo "  Building Debian Package: ${PKG_NAME}_${VERSION}_${ARCH}.deb"
echo "============================================================"

# Clean up previous builds
rm -rf "${BUILD_DIR}"
mkdir -p "${DEB_DIR}/DEBIAN"
mkdir -p "${DEB_DIR}/usr/bin"
mkdir -p "${DEB_DIR}/usr/share/applications"
mkdir -p "${DEB_DIR}/usr/share/icons/hicolor/256x256/apps"
mkdir -p "${DEB_DIR}/opt/${PKG_NAME}"

# 1. DEBIAN Control File
cat <<EOF > "${DEB_DIR}/DEBIAN/control"
Package: ${PKG_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: Toshelectroapparat <admin@boos.uz>
Depends: python3 (>= 3.10), python3-pip, python3-pyqt6, python3-serial
Section: utils
Priority: optional
Homepage: https://ss.boos.uz
Description: ESP32 Studio — Professional Firmware Flasher & Dual Serial Monitor
 Enterprise tool for flashing ESP32 microcontrollers, inspecting LoRa MESH v2
 packets, dual serial monitoring, and configuring NVS options.
EOF

# 2. Desktop Shortcut File (.desktop)
cat <<EOF > "${DEB_DIR}/usr/share/applications/esp32-studio.desktop"
[Desktop Entry]
Name=ESP32 Studio
Comment=Professional Firmware Flasher & Dual Serial Monitor for ESP32
Exec=/usr/bin/esp32-studio
Icon=esp32-studio
Terminal=false
Type=Application
Categories=Development;Electronics;Engineering;
Keywords=esp32;firmware;flasher;lora;serial;mon;
EOF

# 3. Copy Icon
cp "../app_icon.png" "${DEB_DIR}/usr/share/icons/hicolor/256x256/apps/esp32-studio.png"

# 4. Copy Desktop Application Files to /opt/esp32-studio
cp -r ../main.py ../controllers ../services ../ui ../requirements.txt "${DEB_DIR}/opt/${PKG_NAME}/"

# 5. Create /usr/bin/esp32-studio Launcher Script
cat <<'EOF' > "${DEB_DIR}/usr/bin/esp32-studio"
#!/usr/bin/env bash
export PYTHONUNBUFFERED=1
python3 /opt/esp32-studio/main.py "$@"
EOF

chmod +x "${DEB_DIR}/usr/bin/esp32-studio"
chmod 755 "${DEB_DIR}/DEBIAN/control"

# 6. Build .deb package using dpkg-deb
dpkg-deb --build --root-owner-group "${DEB_DIR}" "${PKG_NAME}_${VERSION}_${ARCH}.deb"

echo "============================================================"
echo " SUCCESS! Debian package generated:"
echo " ${PKG_NAME}_${VERSION}_${ARCH}.deb"
echo ""
echo " Install with: sudo dpkg -i ${PKG_NAME}_${VERSION}_${ARCH}.deb"
echo "============================================================"
