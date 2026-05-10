#!/bin/bash
# RouterDiag APK Builder for OpenWrt 25.12+ (apk based)
# This script creates a luci-app-routerdiag.apk package

PKG_NAME="luci-app-routerdiag"
PKG_VERSION="0.9.1a"
PKG_RELEASE="1"
PKG_ARCH="aarch64_cortex-a53"
PKG_DESC="AI-Powered Router Diagnostics for OpenWrt"
PKG_MAINTAINER="Steve Meek"
PKG_DEPENDS="sms_tool msmtp curl ca-bundle"

BUILD_DIR="build_apk"
PKG_FILE="${PKG_NAME}_${PKG_VERSION}-${PKG_RELEASE}_${PKG_ARCH}.apk"

echo "Building $PKG_FILE..."

# 1. Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/usr/bin"
mkdir -p "$BUILD_DIR/etc/init.d"
mkdir -p "$BUILD_DIR/usr/share/luci/menu.d"
mkdir -p "$BUILD_DIR/usr/share/rpcd/acl.d"
mkdir -p "$BUILD_DIR/www/luci-static/resources/view/services"

# 2. Copy files
cp usr/bin/router-diag "$BUILD_DIR/usr/bin/"
cp etc/init.d/router-diag "$BUILD_DIR/etc/init.d/"
cp usr/share/luci/menu.d/luci-app-routerdiag.json "$BUILD_DIR/usr/share/luci/menu.d/"
cp usr/share/rpcd/acl.d/luci-app-routerdiag.json "$BUILD_DIR/usr/share/rpcd/acl.d/"
cp www/luci-static/resources/view/services/routerdiag.js "$BUILD_DIR/www/luci-static/resources/view/services/"

chmod +x "$BUILD_DIR/usr/bin/router-diag"
chmod +x "$BUILD_DIR/etc/init.d/router-diag"

# 3. Create .PKGINFO
cat > "$BUILD_DIR/.PKGINFO" << EOF
pkgname = $PKG_NAME
pkgver = $PKG_VERSION-r$PKG_RELEASE
pkgdesc = $PKG_DESC
url = https://github.com/Wildside-UK/RouterDiag
builddate = $(date +%s)
packager = $PKG_MAINTAINER
size = $(du -sb "$BUILD_DIR" | cut -f1)
arch = $PKG_ARCH
depend = $PKG_DEPENDS
EOF

# 4. Create post-install script (optional but good for enabling service)
cat > "$BUILD_DIR/.POST-INSTALL" << EOF
#!/bin/sh
[ -f /etc/init.d/router-diag ] && /etc/init.d/router-diag enable
exit 0
EOF
chmod +x "$BUILD_DIR/.POST-INSTALL"

# 5. Build the APK (tar.gz format)
# Note: Real APKs use a specific signature block, but we can build a "legacy" one
# that apk will accept with --allow-untrusted.
cd "$BUILD_DIR"
tar -czvf "../$PKG_FILE" .PKGINFO .POST-INSTALL usr etc www 2>/dev/null
cd ..

echo "Done. Package created: $PKG_FILE"
echo "Install on router with: apk add --allow-untrusted ./$PKG_FILE"
