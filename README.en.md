<p align="center">
  <img src="./assets/icon-clash-master.png" width="200" alt="Clash Master Logo" style="margin-bottom: 16px;">
  <br>
  <b style="font-size: 32px;">Clash Master</b>
</p>

<p align="center">
  <b>A more beautiful and modern web application that lets you visualize and manage your Clash network traffic</b><br>
  <span>Real-time Monitoring · Multi-dimensional Analysis · Multi-Backend Management</span>
</p>

<p align="center">
  <a href="https://github.com/foru17/clash-master/stargazers"><img src="https://img.shields.io/github/stars/foru17/clash-master?style=flat-square&color=yellow" alt="Stars"></a>
  <a href="https://hub.docker.com/r/foru17/clash-master"><img src="https://img.shields.io/docker/pulls/foru17/clash-master?style=flat-square&color=blue&logo=docker" alt="Docker Pulls"></a>
  <a href="https://hub.docker.com/r/foru17/clash-master"><img src="https://img.shields.io/docker/v/foru17/clash-master?style=flat-square&label=Docker&color=2496ED" alt="Docker Version"></a>
  <a href="https://github.com/foru17/clash-master/blob/main/LICENSE"><img src="https://img.shields.io/github/license/foru17/clash-master?style=flat-square&color=green" alt="License"></a>
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js" alt="Node.js">
</p>

<p align="center">
  <a href="./README.md">简体中文</a> •
  <b>English</b>
</p>

![Clash Master Overview](./assets/clash-master-overview.png)

## 🤔 Preface

From concept to this complete version, this project took only **4 hours**. The core MVP was completed in just **1 hour** ([Tweet](https://x.com/luoleiorg/status/2019418455276204185)).

Thanks to [@Kai](https://x.com/real_kai42) for providing [Kimi Code](https://www.kimi.com/code/console) Allegretto subscription support.

Throughout the entire development process, I didn't write a single line of code myself (didn't even open an IDE) — all handed over to [Kimi K2.5](https://www.kimi.com/code/console). As a veteran of Vibe Coding, this experience with Kimi still surprised me: **no usage limits, no Token anxiety**. Made-in-China AI, the future is promising.

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [📖 First Use](#-first-use)
- [🔧 Port Conflict Resolution](#-port-conflict-resolution)
- [🐳 Docker Configuration](#-docker-configuration)
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
| 🌙 **Dark Mode**            | Light / Dark / System theme support                           |
| 🌍 **i18n Support**         | English / Chinese seamless switching                          |
| 🔄 **Multi-Backend**        | Monitor multiple OpenClash backend instances simultaneously   |

## 🚀 Quick Start

### Option 1: One-Click Setup Script (Recommended)

The easiest way - automatically detects port conflicts and configures:

```bash
# Download and run
curl -fsSL https://raw.githubusercontent.com/foru17/clash-master/main/setup.sh | bash

# Or use wget
wget -qO- https://raw.githubusercontent.com/foru17/clash-master/main/setup.sh | bash
```

The script will automatically:
- ✅ Check if default ports (3000/3001/3002) are in use
- ✅ Suggest available alternative ports
- ✅ Create configuration file
- ✅ Start the service

### Option 2: Docker Compose (Manual)

Create a `docker-compose.yml` file:

```yaml
services:
  clash-master:
    image: foru17/clash-master:latest
    container_name: clash-master
    restart: unless-stopped
    ports:
      - "3000:3000"   # Web UI
      - "3001:3001"   # API
      - "3002:3002"   # WebSocket
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - API_PORT=3001
      - WS_PORT=3002
      - DB_PATH=/app/data/stats.db
```

Then run:

```bash
docker compose up -d
```

Open `http://localhost:3000` to get started.

### Option 2: Docker Run

```bash
docker run -d \
  --name clash-master \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  foru17/clash-master:latest
```

Open `http://localhost:3000` to get started.

### Option 3: Source Code

```bash
# 1. Clone the repository
git clone https://github.com/foru17/clash-master.git
cd clash-master

# 2. Install dependencies
pnpm install

# 3. Start services
./start.sh

# 4. Open http://localhost:3000 to configure
```

## 📖 First Use

![First Use](./assets/clash-master-setup.png)

1. Open <http://localhost:3000>
2. The **Backend Configuration** dialog will appear on first visit
3. Fill in your OpenClash connection info:
   - **Name**: Custom name (e.g., "Home")
   - **Host**: OpenClash backend address (e.g., `192.168.101.1`)
   - **Port**: OpenClash backend port (e.g., `9090`)
   - **Token**: Fill if Secret is configured, otherwise leave empty
4. Click "Add Backend" to save
5. The system will automatically start collecting data

> 💡 **Get OpenClash Address**: OpenClash Plugin → Enable "External Control" → Copy address

## 🔧 Port Conflict Resolution

If you see "port already in use" error, here are the solutions:

### Solution 1: Use One-Click Script (Easiest)

```bash
./setup.sh
```

The script will automatically detect and suggest available ports.

### Solution 2: Use .env File

Create a `.env` file:

```bash
cp .env.example .env
```

Modify ports to your preferred values:

```env
WEB_EXTERNAL_PORT=8080    # Change Web UI port
API_EXTERNAL_PORT=8081    # Change API port
WS_EXTERNAL_PORT=8082     # Change WebSocket port
```

Then restart:

```bash
docker compose down
docker compose up -d
```

Now access http://localhost:8080

### Solution 3: Directly modify docker-compose.yml

```yaml
ports:
  - "8080:3000"  # External 8080 → Internal 3000
  - "8081:3001"  # External 8081 → Internal 3001
  - "8082:3002"  # External 8082 → Internal 3002
environment:
  - NEXT_PUBLIC_WS_PORT=8082  # Tell frontend to use 8082
```

## 🐳 Docker Configuration

### Ports

| Port |  Purpose  | Required | Description                 |
| :--: | :-------: | :------: | :-------------------------- |
| 3000 |  Web UI   |    ✅    | Frontend access port        |
| 3001 |    API    |    ✅    | REST API port               |
| 3002 | WebSocket |    ✅    | Real-time data transmission |

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

> 💡 New images are automatically built and pushed to [Docker Hub](https://hub.docker.com/r/foru17/clash-master) on every push to `main` or new tag.

## 📁 Project Structure

```
clash-master/
├── docker-compose.yml      # Docker Compose config
├── Dockerfile              # Docker image build
├── docker-start.sh         # Docker startup script
├── start.sh                # Source startup script
├── assets/                 # Screenshots and icons
├── apps/
│   ├── collector/          # Data collection service (Node.js + WebSocket)
│   └── web/                # Next.js frontend app
└── packages/
    └── shared/             # Shared types and utilities
```

## ❓ FAQ

### Q: "Port already in use" error?

**A:** Use the one-click setup script, it will automatically detect and suggest available ports:

```bash
./setup.sh
```

Or manually modify ports in `.env` file.

### Q: Cannot access after changing ports?

**A:** Make sure three things:
1. Ports are modified in `.env` file
2. Service is restarted: `docker compose restart`
3. You're using the new port (e.g., `http://localhost:8080`)

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
docker logs -f clash-master

# View last 100 lines
docker logs --tail 100 clash-master
```

### Q: How to backup data?

**A:** Data is stored in the mapped directory (default `./data/stats.db`):

```bash
cp -r ./data ./data-backup-$(date +%Y%m%d)
```

### Q: How to clean up historical data?

**A:**
1. Click "Backend Config" at the bottom of the left sidebar
2. Switch to the "Database" tab
3. Select cleanup range: 1 day / 7 days / 30 days / All

### Q: Support ARM architecture?

**A:** Docker images support `linux/amd64` and `linux/arm64`.

## 🛠️ Tech Stack

- **Frontend**: [Next.js 15](https://nextjs.org/) + [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Charts**: [Recharts](https://recharts.org/)
- **i18n**: [next-intl](https://next-intl-docs.vercel.app/)
- **Backend**: [Node.js](https://nodejs.org/) + [Fastify](https://www.fastify.io/) + WebSocket
- **Database**: [SQLite](https://www.sqlite.org/) ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3))
- **Build**: [pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/)

## 🤝 Contributing

Contributions are welcome!

- 🐛 [Submit Bug](https://github.com/foru17/clash-master/issues/new)
- 💡 [Request Feature](https://github.com/foru17/clash-master/issues/new)
- 🔧 [Contribute Code](https://github.com/foru17/clash-master/pulls)

## 📄 License

[MIT](LICENSE) © [foru17](https://github.com/foru17)

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=foru17/clash-master&type=date&legend=top-left)](https://www.star-history.com/#foru17/clash-master&type=date&legend=top-left)

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/foru17">@foru17</a></sub><br>
  <sub>If this project helps you, please consider giving it a ⭐</sub>
</p>
