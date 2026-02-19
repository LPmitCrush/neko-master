# Agent Install Guide

## Supported targets

Release artifacts are published for:

- `darwin-amd64`
- `darwin-arm64`
- `linux-amd64`
- `linux-arm64`
- `linux-armv7`
- `linux-mips`
- `linux-mipsle`

## Install via script (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/foru17/neko-master/main/apps/agent/install.sh \
  | env NEKO_SERVER='http://your-panel:3000' \
        NEKO_BACKEND_ID='13' \
        NEKO_BACKEND_TOKEN='ag_xxx' \
        NEKO_GATEWAY_TYPE='clash' \
        NEKO_GATEWAY_URL='http://127.0.0.1:9090' \
        sh
```

Optional env:

- `NEKO_GATEWAY_TOKEN`: gateway auth token
- `NEKO_AGENT_VERSION`: `latest` (default) or explicit tag like `agent-v0.2.0`
- `NEKO_INSTALL_DIR`: install directory (default `$HOME/.local/bin`)
- `NEKO_AUTO_START`: `true|false` (default `true`)
- `NEKO_LOG`: `true|false` (default `true`)
- `NEKO_LOG_FILE`: runtime log file path
- `NEKO_PACKAGE_URL`: custom package URL override
- `NEKO_CHECKSUMS_URL`: custom checksums URL override
- `NEKO_INSTANCE_NAME`: instance name for `nekoagent` manager (default `backend-<id>`)

After install, manage agent with:

```bash
nekoagent status <instance>
nekoagent logs <instance>
nekoagent restart <instance>
nekoagent update <instance> agent-vX.Y.Z
```

## Manual install

1. Download the correct tarball from GitHub Releases
2. Verify hash using `checksums.txt`
3. Extract `neko-agent`
4. Run executable with backend parameters

## OpenWrt note

Before build selection, check architecture:

```sh
uname -m
opkg print-architecture
```

Common mapping:

- `x86_64` -> `linux-amd64`
- `aarch64` -> `linux-arm64`
- `armv7*` -> `linux-armv7`
- `mips` -> `linux-mips`
- `mipsle` -> `linux-mipsle`
