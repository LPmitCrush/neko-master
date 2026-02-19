#!/usr/bin/env sh
set -eu

require_env() {
	key="$1"
	eval "val=\${$key:-}"
	if [ -z "$val" ]; then
		echo "[neko-agent] error: env $key is required" >&2
		exit 1
	fi
}

download_file() {
	url="$1"
	output="$2"
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$url" -o "$output"
		return 0
	fi
	if command -v wget >/dev/null 2>&1; then
		wget -qO "$output" "$url"
		return 0
	fi
	echo "[neko-agent] error: curl or wget is required" >&2
	exit 1
}

normalize_os() {
	raw="$(uname -s | tr '[:upper:]' '[:lower:]')"
	case "$raw" in
	linux) echo "linux" ;;
	darwin) echo "darwin" ;;
	*)
		echo "[neko-agent] error: unsupported OS: $raw" >&2
		exit 1
		;;
	esac
}

normalize_arch() {
	raw="$(uname -m | tr '[:upper:]' '[:lower:]')"
	case "$raw" in
	x86_64 | amd64) echo "amd64" ;;
	aarch64 | arm64) echo "arm64" ;;
	armv7l | armv7 | armhf) echo "armv7" ;;
	mips) echo "mips" ;;
	mipsle) echo "mipsle" ;;
	*)
		echo "[neko-agent] error: unsupported architecture: $raw" >&2
		echo "[neko-agent] hint: set NEKO_PACKAGE_URL manually if your target is exotic" >&2
		exit 1
		;;
	esac
}

compute_sha256() {
	file="$1"
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$file" | awk '{print $1}'
		return 0
	fi
	if command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$file" | awk '{print $1}'
		return 0
	fi
	if command -v openssl >/dev/null 2>&1; then
		openssl dgst -sha256 "$file" | awk '{print $2}'
		return 0
	fi
	echo ""
}

require_env "NEKO_SERVER"
require_env "NEKO_BACKEND_ID"
require_env "NEKO_BACKEND_TOKEN"
require_env "NEKO_GATEWAY_URL"

NEKO_GATEWAY_TYPE="${NEKO_GATEWAY_TYPE:-clash}"
NEKO_GATEWAY_TOKEN="${NEKO_GATEWAY_TOKEN:-}"
NEKO_AGENT_REPO="${NEKO_AGENT_REPO:-foru17/neko-master}"
NEKO_AGENT_VERSION="${NEKO_AGENT_VERSION:-latest}"
NEKO_PACKAGE_URL="${NEKO_PACKAGE_URL:-}"
NEKO_CHECKSUMS_URL="${NEKO_CHECKSUMS_URL:-}"
NEKO_INSTALL_DIR="${NEKO_INSTALL_DIR:-$HOME/.local/bin}"
NEKO_LOG="${NEKO_LOG:-true}"
NEKO_AUTO_START="${NEKO_AUTO_START:-true}"
NEKO_LOG_FILE="${NEKO_LOG_FILE:-$HOME/.cache/neko-agent-${NEKO_BACKEND_ID}.log}"

os="$(normalize_os)"
arch="$(normalize_arch)"

if [ "$NEKO_AGENT_VERSION" = "latest" ]; then
	release_path="releases/latest/download"
else
	release_path="releases/download/${NEKO_AGENT_VERSION}"
fi

if [ "$NEKO_AGENT_VERSION" = "latest" ]; then
	asset="neko-agent_${os}_${arch}.tar.gz"
else
	asset="neko-agent_${NEKO_AGENT_VERSION}_${os}_${arch}.tar.gz"
fi
checksums_asset="checksums.txt"

if [ -n "$NEKO_PACKAGE_URL" ]; then
	package_url="$NEKO_PACKAGE_URL"
else
	package_url="https://github.com/${NEKO_AGENT_REPO}/${release_path}/${asset}"
fi

if [ -n "$NEKO_CHECKSUMS_URL" ]; then
	checksums_url="$NEKO_CHECKSUMS_URL"
else
	checksums_url="https://github.com/${NEKO_AGENT_REPO}/${release_path}/${checksums_asset}"
fi

tmp_dir="${TMPDIR:-/tmp}/neko-agent.$$"
mkdir -p "$tmp_dir"
trap 'rm -rf "$tmp_dir"' EXIT INT TERM

archive_path="$tmp_dir/neko-agent.tar.gz"
checksums_path="$tmp_dir/checksums.txt"

echo "[neko-agent] downloading package: $package_url"
download_file "$package_url" "$archive_path"

if [ -z "$NEKO_PACKAGE_URL" ]; then
	echo "[neko-agent] downloading checksums: $checksums_url"
	download_file "$checksums_url" "$checksums_path"

	expected_hash="$(awk '$2 == "'"$asset"'" {print $1}' "$checksums_path" | head -n 1)"
	if [ -z "$expected_hash" ]; then
		echo "[neko-agent] error: cannot find checksum for $asset" >&2
		exit 1
	fi

	actual_hash="$(compute_sha256 "$archive_path")"
	if [ -z "$actual_hash" ]; then
		echo "[neko-agent] error: missing sha256 tooling (sha256sum/shasum/openssl)" >&2
		exit 1
	fi

	if [ "$expected_hash" != "$actual_hash" ]; then
		echo "[neko-agent] error: checksum mismatch for $asset" >&2
		echo "[neko-agent] expected: $expected_hash" >&2
		echo "[neko-agent] actual:   $actual_hash" >&2
		exit 1
	fi
fi

mkdir -p "$tmp_dir/extract"
tar -xzf "$archive_path" -C "$tmp_dir/extract"

binary_source="$tmp_dir/extract/neko-agent"
if [ ! -f "$binary_source" ]; then
	echo "[neko-agent] error: extracted archive does not contain neko-agent" >&2
	exit 1
fi

chmod +x "$binary_source"
mkdir -p "$NEKO_INSTALL_DIR"
install_target="$NEKO_INSTALL_DIR/neko-agent"
mv "$binary_source" "$install_target"
chmod +x "$install_target"

if ! echo ":$PATH:" | grep -q ":$NEKO_INSTALL_DIR:"; then
	echo "[neko-agent] warning: $NEKO_INSTALL_DIR is not in PATH"
fi

set -- "$install_target" \
	--server-url "$NEKO_SERVER" \
	--backend-id "$NEKO_BACKEND_ID" \
	--backend-token "$NEKO_BACKEND_TOKEN" \
	--gateway-type "$NEKO_GATEWAY_TYPE" \
	--gateway-url "$NEKO_GATEWAY_URL" \
	--log="$NEKO_LOG"

if [ -n "$NEKO_GATEWAY_TOKEN" ]; then
	set -- "$@" --gateway-token "$NEKO_GATEWAY_TOKEN"
fi

echo "[neko-agent] installed to: $install_target"
echo "[neko-agent] run command:"
cat <<EOF
$install_target \\
  --server-url "$NEKO_SERVER" \\
  --backend-id "$NEKO_BACKEND_ID" \\
  --backend-token "$NEKO_BACKEND_TOKEN" \\
  --gateway-type "$NEKO_GATEWAY_TYPE" \\
  --gateway-url "$NEKO_GATEWAY_URL" \\
  --log="$NEKO_LOG"$(if [ -n "$NEKO_GATEWAY_TOKEN" ]; then printf " \\\n+  --gateway-token \"$NEKO_GATEWAY_TOKEN\""; fi)
EOF

if [ "$NEKO_AUTO_START" = "true" ]; then
	mkdir -p "$(dirname "$NEKO_LOG_FILE")"
	nohup "$@" >"$NEKO_LOG_FILE" 2>&1 &
	echo "[neko-agent] started in background, pid=$!, log=$NEKO_LOG_FILE"
else
	echo "[neko-agent] auto-start disabled (NEKO_AUTO_START=false)"
fi
