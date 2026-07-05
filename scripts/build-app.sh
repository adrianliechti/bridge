#!/usr/bin/env bash
#
# Build the macOS desktop app bundle into app/build/bin/Bridge.app.
#
#   scripts/build-app.sh [version]
#
# The bundle is assembled from scratch: Go binary, Info.plist (with the
# version stamped in), an icns rendered from app/appicon.png, and an ad-hoc
# code signature (required on Apple Silicon; the app is not notarized —
# the Homebrew cask strips the quarantine attribute instead).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-0.0.0}"
APP="app/build/bin/Bridge.app"

echo "build-app: compiling Bridge ${VERSION}"
(cd app && CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o "build/bin/.Bridge-bin" .)

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

mv "app/build/bin/.Bridge-bin" "$APP/Contents/MacOS/Bridge"
sed "s/__VERSION__/${VERSION}/g" app/Info.plist > "$APP/Contents/Info.plist"

# Render the .icns from the 1024px source PNG.
ICONSET="$(mktemp -d)/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" app/appicon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" app/appicon.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns"
rm -rf "$(dirname "$ICONSET")"

codesign --force --sign - "$APP"

echo "build-app: built $APP"
