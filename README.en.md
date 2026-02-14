<p align="center">
  <img src="./assets/icon-neko-master.png" width="200" alt="Neko Master Logo" style="margin-bottom: 16px;">
  <br>
  <b style="font-size: 32px;">Neko Master</b>
</p>

<p align="center">
  <b>See your network traffic clearly.</b><br>
  <span>Real-time monitoring · Traffic auditing · Multi-gateway support</span>
</p>

<p align="center">
  <b>English</b> | <a href="./README.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/foru17/neko-master/stargazers"><img src="https://img.shields.io/github/stars/foru17/neko-master?style=flat-square&color=yellow" alt="Stars"></a>
  <a href="https://hub.docker.com/r/foru17/neko-master"><img src="https://img.shields.io/docker/pulls/foru17/neko-master?style=flat-square&color=blue&logo=docker" alt="Docker Pulls"></a>
  <a href="https://hub.docker.com/r/foru17/neko-master"><img src="https://img.shields.io/docker/v/foru17/neko-master?style=flat-square&label=Docker&color=2496ED" alt="Docker Version"></a>
  <a href="https://github.com/foru17/neko-master/blob/main/LICENSE"><img src="https://img.shields.io/github/license/foru17/neko-master?style=flat-square&color=green" alt="License"></a>
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js">
</p>

> [!IMPORTANT]
> **Disclaimer**
>
> This project is a traffic analysis and visualization tool
> for local gateway environments.
>
> It does not provide any network access service,
> proxy subscription, or cross-network connectivity.
> All data is collected from the user's own network environment.
>
> This project is open-sourced under the MIT License. We assume no responsibility for any consequences resulting from the use of this software. Please use it in compliance with applicable laws and regulations.

![Neko Master Overview](./assets/neko-master-overview.png)
![Neko Master Rules](./assets/neko-master-rules.png)
![Neko Master Regions](./assets/neko-master-regions.png)

## About the Name

**Neko** (ねこ) means _cat_ in Japanese.  
Pronounced **/ˈneɪkoʊ/** (NEH-ko).

Like a cat, Neko Master observes network traffic quietly and precisely.  
It is a lightweight analytics dashboard designed for modern gateway environments.

## 📋 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [📖 First Use](#-first-use)
- [🔧 Port Conflict Resolution](#-port-conflict-resolution)
- [🐳 Docker Configuration](#-docker-configuration)
- [🌐 Reverse Proxy & Tunnel](#-reverse-proxy--tunnel)
- [❓ FAQ](#-faq)
- [📁 Project Structure](#-project-structure)
- [🛠️ Tech Stack](#️-tech-stack)
- [📄 License](#-license)

## ✨ Features

| Feature                     | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| 📊 **Real-time Monitoring** | WebSocket real-time collection with millisecond latency       |
| 📈 **Trend Analysis**       | Multi-dimensional traffic trends: 30min / 1h / 24h            |
| 🌐 **Domain Analysis**      | View traffic, associated IPs, and connection count per domain |
| 🗺️ **IP Analysis**          | ASN, geo-location, and associated domain display              |
| 🚀 **Proxy Statistics**     | Traffic distribution and connection count per proxy node      |
| 📱 **PWA Support**          | Install as desktop app for native experience                  |
| 🌙 **Dark Mode**            | Light / Dark / System theme support                           |
| 🌍 **i18n Support**         | English / Chinese seamless switching                          |
| 🔄 **Multi-Backend**        | Monitor multiple OpenClash backend instances simultaneously   |

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

#### Scenario A: Minimal deployment (only expose 3000)

```yaml
services:
  neko-master:
    image: foru17/neko-master:latest
    container_name: neko-master
    restart: unless-stopped
    ports:
      - "3000:3000" # Web UI
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/stats.db
```

> This mode is fully upgrade-compatible and works out of the box.  
> If WS is not routed, the app falls back to HTTP polling automatically.

#### Scenario B: Real-time WebSocket (recommended with reverse proxy)

```yaml
services:
  neko-master:
    image: foru17/neko-master:latest
    container_name: neko-master
    restart: unless-stopped
    ports:
      - "3000:3000" # Web UI
      - "3002:3002" # WebSocket (for Nginx / Tunnel forwarding)
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/stats.db
```

Then run:

```bash
docker compose up -d
```

Open <http://localhost:3000> to get started.

### Option 2: Docker Run

```bash
# Minimal (only 3000)
docker run -d \
  --name neko-master \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  foru17/neko-master:latest

# Real-time WS (with reverse proxy)
docker run -d \
  --name neko-master \
  -p 3000:3000 \
  -p 3002:3002 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  foru17/neko-master:latest
```

Open <http://localhost:3000> to get started.

> The frontend uses same-origin `/api` by default, so port 3001 is usually not required externally.  
> For real-time WS, your reverse proxy/tunnel must be able to reach port `3002`. If not, the app falls back to ~5s HTTP polling.

> If you use custom external ports with `docker run`, also pass:
> `-e WEB_EXTERNAL_PORT=8080 -e API_EXTERNAL_PORT=8081 -e WS_EXTERNAL_PORT=8082`

### Option 3: One-Click Script

Automatically detects port conflicts and configures everything:

```bash
# Using curl
curl -fsSL https://raw.githubusercontent.com/foru17/neko-master/main/setup.sh | bash

# Or using wget
wget -qO- https://raw.githubusercontent.com/foru17/neko-master/main/setup.sh | bash
```

The script will automatically:

- ✅ Download `docker-compose.yml`
- ✅ Check if default ports (3000/3001/3002) are in use
- ✅ Suggest available alternative ports
- ✅ Create configuration file and start the service

### Option 4: Source Code

```bash
# 1. Clone the repository
git clone https://github.com/foru17/neko-master.git
cd neko-master

# 2. Install dependencies
pnpm install

# 3. Start development services
pnpm dev
```

Open <http://localhost:3000> to configure.

## 📖 First Use

![First Use](./assets/neko-master-setup.png)

### Connect Clash / Mihomo

1. Open <http://localhost:3000>
2. The **Gateway Configuration** dialog will appear on first visit
3. Fill in your network gateway (e.g., OpenClash) connection info:
   - **Name**: Custom name (e.g., "Home Gateway")
   - **Type**: Select `Clash / Mihomo`
   - **Host**: Gateway backend address (e.g., `192.168.101.1`)
   - **Port**: Gateway backend port (e.g., `9090`)
   - **Token**: Fill if Secret is configured, otherwise leave empty
4. Click "Add Backend" to save
5. The system will automatically start collecting and analyzing traffic data

> 💡 **Get Gateway Address**: Go to your gateway control panel (e.g., OpenClash) → Enable "External Control" → Copy API address

### Connect Surge

![Surge HTTP API Configuration](./assets/neko-master-surge.png)

Neko Master supports connecting to Surge gateways for complete rule chain visualization and traffic analysis.

#### 1. Enable Surge HTTP API

Enable HTTP remote API in your Surge configuration:

```ini
[General]
http-api = 127.0.0.1:9091
http-api-tls = false
http-api-web-dashboard = true
```

Or configure via Surge's graphical interface:

- **HTTP Remote API**: `Settings` → `General` → `HTTP Remote API`
- **Port**: Default `9091`
- **Authentication**: Recommended to set a password for enhanced security

#### 2. Add Surge Backend in Neko Master

1. Open Neko Master settings dialog
2. Click "Add Backend"
3. Fill in the connection info:
   - **Name**: Custom name (e.g., "Surge Home")
   - **Type**: Select `Surge`
   - **Host**: IP address where Surge is running (e.g., `192.168.1.1` or `127.0.0.1`)
   - **Port**: HTTP API port (default `9091`)
   - **Token**: HTTP API password (if configured)
4. Click "Test Connection" to verify the configuration
5. Save the configuration

> 💡 **Note**: Surge uses HTTP polling to fetch data (compared to Clash's WebSocket real-time stream), with a data refresh delay of approximately 2 seconds.

## 🔧 Port Conflict Resolution

If you see "port already in use" error, here are the solutions:

### Solution 1: Use .env File

Create a `.env` file in the same directory as `docker-compose.yml`:

```env
WEB_EXTERNAL_PORT=8080    # Change Web UI port
API_EXTERNAL_PORT=8081    # Change API port
WS_EXTERNAL_PORT=8082     # Change WebSocket external port (only for direct access)
```

Then restart:

```bash
docker compose down
docker compose up -d
```

Now access <http://localhost:8080>

### Solution 2: Directly Modify docker-compose.yml

```yaml
ports:
  - "8080:3000" # External 8080 → Internal 3000
  - "8082:3002" # External 8082 → Internal 3002 (for proxy/tunnel WS forwarding)
```

> Note: the frontend reads external ports at runtime, so `NEXT_PUBLIC_WS_PORT` is no longer required.

### Solution 3: Use One-Click Script

```bash
curl -fsSL https://raw.githubusercontent.com/foru17/neko-master/main/setup.sh | bash
```

The script will automatically detect and suggest available ports.

## 🐳 Docker Configuration

### Ports

| Port |  Purpose  | External Required | Description                                                                      |
| :--: | :-------: | :---------------: | :------------------------------------------------------------------------------- |
| 3000 |  Web UI   |        ✅         | Frontend entry point                                                             |
| 3001 |    API    |     Optional      | Frontend uses same-origin `/api` by default; usually no external exposure needed |
| 3002 | WebSocket |     Optional      | Real-time push endpoint; recommended to forward via reverse proxy/tunnel         |

### Environment Variables (Docker)

| Variable              | Default              | Purpose                                    | When to set                          |
| :-------------------- | :------------------- | :----------------------------------------- | :----------------------------------- |
| `WEB_PORT`            | `3000`               | Web service listen port (inside container) | Usually unchanged                    |
| `API_PORT`            | `3001`               | API service listen port (inside container) | Usually unchanged                    |
| `COLLECTOR_WS_PORT`   | `3002`               | WS service listen port (inside container)  | Usually unchanged                    |
| `DB_PATH`             | `/app/data/stats.db` | SQLite data path                           | Custom data path                     |
| `WEB_EXTERNAL_PORT`   | `3000`               | Runtime-exposed external web port          | When external mapping changes        |
| `API_EXTERNAL_PORT`   | `3001`               | Runtime-exposed external API port          | Only for direct API access           |
| `WS_EXTERNAL_PORT`    | `3002`               | Runtime-exposed external WS port           | Only for direct WS access            |
| `NEXT_PUBLIC_API_URL` | empty                | Override frontend API base URL             | When API is not same-origin          |
| `NEXT_PUBLIC_WS_URL`  | auto `/_cm_ws`       | Override frontend WS URL                   | Only if you want custom WS path/host |

### API / WS Resolution Priority

1. API: `runtime-config(API_URL)` → `NEXT_PUBLIC_API_URL` → same-origin `/api`
2. WS: `runtime-config(WS_URL)` → `NEXT_PUBLIC_WS_URL` → auto detection
3. Default already uses same-origin `/_cm_ws`; no manual env required for normal deployments

## 🌐 Reverse Proxy & Tunnel

Recommended approach: keep Web and WS under the same domain, with path routing:
`/` → `3000`, `/_cm_ws` → `3002`.

### Nginx Standard Example

```nginx
server {
  listen 443 ssl http2;
  server_name neko.example.com;

  location / {
    proxy_pass http://<neko-master-host>:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location ^~ /_cm_ws {
    proxy_pass http://<neko-master-host>:3002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    proxy_buffering off;
  }
}
```

Optional env override:

```env
# Not required by default (already /_cm_ws)
# NEXT_PUBLIC_WS_URL=/custom_ws
```

### Cloudflare Tunnel Standard Example

`~/.cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-name-or-id>
credentials-file: /path/to/<credentials>.json

ingress:
  - hostname: neko.example.com
    path: /_cm_ws*
    service: http://localhost:3002
  - hostname: neko.example.com
    path: /*
    service: http://localhost:3000
  - service: http_status:404
```

Run:

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml run <your-tunnel-name-or-id>
```

For Zero Trust dashboard-managed routes (token mode), configure the same two routes and keep `/_cm_ws*` above `/*`.

### Key Notes

1. Do not use `ws` (without leading slash) as WS path; it can overmatch and cause `/_next/static/...` → `426 Upgrade Required`
2. WS route must be above catch-all `/*`
3. `NEXT_PUBLIC_WS_URL` is optional by default; if customized, restart frontend/container after changes
4. Mapping only `3000` still works, but falls back to HTTP polling (~5s), with less real-time responsiveness
5. `beacon.min.js` failures (Cloudflare analytics script) are typically unrelated to app API/WS data flow
6. No extra `/api` reverse-proxy rule is required in most setups; frontend uses same-origin `/api` and app handles internal forwarding to `3001`

### Multi-Architecture Support

Docker images support both `linux/amd64` and `linux/arm64`.

### Data Persistence

Data is stored in `/app/data` inside the container. Mount it to host to prevent data loss:

```yaml
volumes:
  - ./data:/app/data
```

### Update to Latest

```bash
# Pull the latest image and restart
docker compose pull
docker compose up -d
```

## ❓ FAQ

### Q: "Port already in use" error?

**A:** See [Port Conflict Resolution](#-port-conflict-resolution) above. The simplest approach is to create a `.env` file with custom ports.

### Q: Cannot access after changing ports?

**A:** Make sure three things:

1. Ports are modified in `.env` file
2. Service is restarted: `docker compose restart`
3. You're using the new port (e.g., `http://localhost:8080`)

### Q: Will upgrading break users who only expose `3000:3000`?

**A:** No. Core functionality remains available.  
If WS is not routed, the app automatically falls back to HTTP polling.

### Q: If WS forwarding is not configured, will it affect usage?

**A:** Core features and data display still work.  
The difference is real-time experience: without WS, updates are polling-based (about every 5 seconds).

### Q: Why do I see `/_next/static/... 426 Upgrade Required`?

**A:** WS route matching is usually too broad and static assets are being forwarded to the WS port. Check:

1. In Cloudflare Tunnel / Nginx, do not use `ws` as path; use `/_cm_ws*`
2. WS route priority must be above `/*`
3. If `NEXT_PUBLIC_WS_URL` is manually set, ensure it matches your proxy path (for example `/_cm_ws`)

### Q: Failed to connect to OpenClash?

**A:** Check the following:

1. Is "External Control" enabled in OpenClash?
2. Is the OpenClash address correct? (Format: `IP:Port`)
3. If Secret is configured, is the Token correct?
4. Can the container access OpenClash's network? (Check firewall settings)

### Q: How to view service logs?

**A:**

```bash
# View all logs
docker logs -f neko-master

# View last 100 lines
docker logs --tail 100 neko-master
```

### Q: How to backup data?

**A:** Data is stored in the mapped directory (default `./data/stats.db`):

```bash
cp -r ./data ./data-backup-$(date +%Y%m%d)
```

### Q: How to clean up historical data?

**A:**

1. Click "Settings" at the bottom of the left sidebar
2. Switch to the "Database" tab
3. Select cleanup range: 1 day / 7 days / 30 days / All

## 📁 Project Structure

```
neko-master/
├── docker-compose.yml      # Docker Compose config
├── Dockerfile              # Docker image build
├── setup.sh                # One-click setup script
├── docker-start.sh         # Docker container startup script
├── start.sh                # Source code dev startup script
├── assets/                 # Screenshots and icons
├── apps/
│   ├── collector/          # Data collection service (Node.js + WebSocket)
│   └── web/                # Next.js frontend app
└── packages/
    └── shared/             # Shared types and utilities
```

## 🛠️ Tech Stack

- **Frontend**: [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Charts**: [Recharts](https://recharts.org/)
- **i18n**: [next-intl](https://next-intl-docs.vercel.app/)
- **Backend**: [Node.js](https://nodejs.org/) + [Fastify](https://www.fastify.io/) + WebSocket
- **Database**: [SQLite](https://www.sqlite.org/) ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3))
- **Build**: [pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/)

## 🤝 Contributing

Contributions are welcome!

- 🐛 [Submit Bug](https://github.com/foru17/neko-master/issues/new)
- 💡 [Request Feature](https://github.com/foru17/neko-master/issues/new)
- 🔧 [Contribute Code](https://github.com/foru17/neko-master/pulls)

## 📄 License

[MIT](LICENSE) © [foru17](https://github.com/foru17)

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=foru17/neko-master&type=date&legend=top-left)](https://www.star-history.com/#foru17/neko-master&type=date&legend=top-left)

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/foru17">@foru17</a></sub><br>
  <sub>If this project helps you, please consider giving it a ⭐</sub>
</p>
