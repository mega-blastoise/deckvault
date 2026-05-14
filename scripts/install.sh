#!/bin/sh
set -eu

REPO="nicholasgalante1997/deckvault"
INSTALL_DIR="${JOHTO_INSTALL_DIR:-$HOME/.local/share/johto}"
BIN_DIR="${JOHTO_BIN_DIR:-$HOME/.local/bin}"

# Detect platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$OS-$ARCH" in
  linux-x86_64)   SUFFIX="linux-x64"   ;;
  linux-aarch64)  SUFFIX="linux-arm64" ;;
  darwin-x86_64)  SUFFIX="darwin-x64"  ;;
  darwin-arm64)   SUFFIX="darwin-arm64";;
  *) echo "Unsupported platform: $OS-$ARCH (supported: linux-x64, linux-arm64, darwin-x64, darwin-arm64)" >&2; exit 1 ;;
esac

# Resolve latest release tag
TAG="${JOHTO_VERSION:-$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -n1 | cut -d'"' -f4)}"
[ -z "$TAG" ] && { echo "Failed to resolve latest release" >&2; exit 1; }

URL="https://github.com/$REPO/releases/download/$TAG/johto-$TAG-$SUFFIX.tar.gz"

mkdir -p "$INSTALL_DIR/bin" "$BIN_DIR"
echo "Downloading $URL ..."
curl -fsSL "$URL" | tar -xz -C "$INSTALL_DIR"

ln -sf "$INSTALL_DIR/bin/johto"              "$BIN_DIR/johto"
ln -sf "$INSTALL_DIR/bin/pokemon-mcp-server" "$BIN_DIR/pokemon-mcp-server"

# Fetch card data (separate tarball, versioned independently)
DATA_TAG="$(curl -fsSL "https://registry.npmjs.org/@johto-ai/card-data/latest" | grep -o '"version":"[^"]*"' | head -n1 | cut -d'"' -f4)"
DATA_URL="https://registry.npmjs.org/@johto-ai/card-data/-/card-data-$DATA_TAG.tgz"
DATA_DIR="$INSTALL_DIR/card-data"
mkdir -p "$DATA_DIR"
curl -fsSL "$DATA_URL" | tar -xz -C "$DATA_DIR" --strip-components=1

echo
echo "johto $TAG installed to $INSTALL_DIR"
echo "Symlinked to $BIN_DIR/johto"
echo
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "WARNING: $BIN_DIR is not on your PATH. Add this to your shell profile:"; echo "  export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
echo
echo "Run 'johto init' to set up your config."
