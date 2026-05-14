#!/usr/bin/env bash
set -euo pipefail

TARGET_TRIPLE="${1:?Usage: pack-platform.sh <triple> <suffix>}"
SUFFIX="${2:?}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
OUT_DIR="${REPO_ROOT}/dist-packages/mcp-server-platforms/${SUFFIX}"
TMPL_DIR="${REPO_ROOT}/dist-packages/mcp-server-platforms/_template"
mkdir -p "${OUT_DIR}/bin"

echo "Building MCP server for ${TARGET_TRIPLE} (${SUFFIX})..."

if [[ "${TARGET_TRIPLE}" == *-linux-* ]] && command -v cross &>/dev/null; then
  cross build --release --target "${TARGET_TRIPLE}" --manifest-path "${REPO_ROOT}/apps/mcp-server/Cargo.toml"
else
  cargo build --release --target "${TARGET_TRIPLE}" --manifest-path "${REPO_ROOT}/apps/mcp-server/Cargo.toml"
fi

BIN_PATH="${REPO_ROOT}/apps/mcp-server/target/${TARGET_TRIPLE}/release/pokemon-mcp-server"
strip "${BIN_PATH}" 2>/dev/null || true
cp "${BIN_PATH}" "${OUT_DIR}/bin/pokemon-mcp-server"
chmod +x "${OUT_DIR}/bin/pokemon-mcp-server"

OS=""
CPU=""
case "${SUFFIX}" in
  linux-x64)    OS="linux";  CPU="x64"   ;;
  linux-arm64)  OS="linux";  CPU="arm64" ;;
  darwin-x64)   OS="darwin"; CPU="x64"   ;;
  darwin-arm64) OS="darwin"; CPU="arm64" ;;
  *) echo "Unknown suffix: ${SUFFIX}"; exit 1 ;;
esac

sed -e "s/\${SUFFIX}/${SUFFIX}/g" \
    -e "s/\${OS}/${OS}/g" \
    -e "s/\${CPU}/${CPU}/g" \
    "${TMPL_DIR}/package.json.tmpl" > "${OUT_DIR}/package.json"

sed -e "s/\${SUFFIX}/${SUFFIX}/g" \
    "${TMPL_DIR}/README.md.tmpl" > "${OUT_DIR}/README.md"

echo "Done: MCP server ${SUFFIX} -> ${OUT_DIR}/bin/pokemon-mcp-server"
