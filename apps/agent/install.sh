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
NEKO_CLI_URL="${NEKO_CLI_URL:-}"
NEKO_INSTALL_DIR="${NEKO_INSTALL_DIR:-$HOME/.local/bin}"
NEKO_LOG="${NEKO_LOG:-true}"
NEKO_AUTO_START="${NEKO_AUTO_START:-true}"
NEKO_INSTANCE_NAME="${NEKO_INSTANCE_NAME:-backend-${NEKO_BACKEND_ID}}"

os="$(normalize_os)"
arch="$(normalize_arch)"

if [ "$NEKO_AGENT_VERSION" = "latest" ]; then
	release_path="releases/latest/download"
	asset="neko-agent_${os}_${arch}.tar.gz"
else
	release_path="releases/download/${NEKO_AGENT_VERSION}"
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

if [ -n "$NEKO_CLI_URL" ]; then
	cli_url="$NEKO_CLI_URL"
else
	if [ "$NEKO_AGENT_VERSION" = "latest" ]; then
		cli_ref="main"
	else
		cli_ref="$NEKO_AGENT_VERSION"
	fi
	cli_url="https://raw.githubusercontent.com/${NEKO_AGENT_REPO}/${cli_ref}/apps/agent/nekoagent"
fi

tmp_dir="${TMPDIR:-/tmp}/neko-agent.$$"
mkdir -p "$tmp_dir"
trap 'rm -rf "$tmp_dir"' EXIT INT TERM

archive_path="$tmp_dir/neko-agent.tar.gz"
checksums_path="$tmp_dir/checksums.txt"
cli_path="$tmp_dir/nekoagent"

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

echo "[neko-agent] downloading manager cli: $cli_url"
download_file "$cli_url" "$cli_path"
chmod +x "$cli_path"
cli_target="$NEKO_INSTALL_DIR/nekoagent"
mv "$cli_path" "$cli_target"
chmod +x "$cli_target"

if ! echo ":$PATH:" | grep -q ":$NEKO_INSTALL_DIR:"; then
	echo "[neko-agent] warning: $NEKO_INSTALL_DIR is not in PATH"
fi

"$cli_target" init "$NEKO_INSTANCE_NAME" \
	"NEKO_SERVER=$NEKO_SERVER" \
	"NEKO_BACKEND_ID=$NEKO_BACKEND_ID" \
	"NEKO_BACKEND_TOKEN=$NEKO_BACKEND_TOKEN" \
	"NEKO_GATEWAY_TYPE=$NEKO_GATEWAY_TYPE" \
	"NEKO_GATEWAY_URL=$NEKO_GATEWAY_URL" \
	"NEKO_GATEWAY_TOKEN=$NEKO_GATEWAY_TOKEN" \
	"NEKO_LOG=$NEKO_LOG"

echo "[neko-agent] installed to: $install_target"
echo "[neko-agent] management cli: $cli_target"
echo "[neko-agent] configured instance: $NEKO_INSTANCE_NAME"
echo "[neko-agent] common commands:"
echo "  $cli_target start $NEKO_INSTANCE_NAME"
echo "  $cli_target stop $NEKO_INSTANCE_NAME"
echo "  $cli_target status $NEKO_INSTANCE_NAME"
echo "  $cli_target logs $NEKO_INSTANCE_NAME"
echo "  $cli_target update $NEKO_INSTANCE_NAME [agent-vX.Y.Z]"

if [ "$NEKO_AUTO_START" = "true" ]; then
	"$cli_target" start "$NEKO_INSTANCE_NAME"
else
	echo "[neko-agent] auto-start disabled (NEKO_AUTO_START=false)"
fi
