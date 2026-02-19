# Agent Quick Start

## 1) Create an Agent backend in UI

In `Settings -> Backends`:

1. Add backend
2. Set mode to `Agent`
3. Choose gateway type (`Clash` or `Surge`)
4. Save backend

Then open `View Agent Script` and copy either:

- Run command (`./neko-agent ...`)
- Install command (`curl | sh`)

## 2) Install on remote host

Example:

```bash
curl -fsSL https://raw.githubusercontent.com/foru17/neko-master/main/apps/agent/install.sh \
  | env NEKO_SERVER='http://your-panel:3000' \
        NEKO_BACKEND_ID='13' \
        NEKO_BACKEND_TOKEN='ag_xxx' \
        NEKO_GATEWAY_TYPE='surge' \
        NEKO_GATEWAY_URL='http://127.0.0.1:9091' \
        NEKO_GATEWAY_TOKEN='optional' \
        sh
```

## 3) Verify status

- In backend list, click `Test Connection`
- Confirm agent health becomes online
- Confirm traffic is visible in dashboard

## Important notes

- Use actual panel address in `NEKO_SERVER`; avoid `localhost` unless panel runs on same host
- Rotate token if leaked; old agent process will be rejected until reconfigured
