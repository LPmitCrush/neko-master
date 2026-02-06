<p align="center">
  <img src="./assets/icon-clash-master.png" width="200" alt="Clash Master Logo" style="margin-bottom: 16px;">
  <br>
  <b style="font-size: 32px;">Clash Master</b>
</p>

<p align="center">
  <b>优雅且现代化的 OpenClash 流量可视化分析工具</b><br>
  <span>实时监控 · 多维度分析 · 多后端管理</span>
</p>

<p align="center">
  <a href="https://github.com/foru17/clash-master/stargazers"><img src="https://img.shields.io/github/stars/foru17/clash-master?style=flat-square&color=yellow" alt="Stars"></a>
  <a href="https://hub.docker.com/r/foru17/clash-master"><img src="https://img.shields.io/docker/pulls/foru17/clash-master?style=flat-square&color=blue&logo=docker" alt="Docker Pulls"></a>
  <a href="https://hub.docker.com/r/foru17/clash-master"><img src="https://img.shields.io/docker/v/foru17/clash-master?style=flat-square&label=Docker&color=2496ED" alt="Docker Version"></a>
  <a href="https://github.com/foru17/clash-master/blob/main/LICENSE"><img src="https://img.shields.io/github/license/foru17/clash-master?style=flat-square&color=green" alt="License"></a>
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js" alt="Node.js">
</p>

<p align="center">
  <b>简体中文</b> •
  <a href="./README.en.md">English</a>
</p>

![Clash Master Overview](./assets/clash-master-overview.png)

## 📋 目录

- [🚀 快速开始](#-快速开始)
- [📖 首次使用](#-首次使用)
- [🔧 端口冲突解决](#-端口冲突解决)
- [🐳 Docker 配置](#-docker-配置)
- [❓ 常见问题](#-常见问题)
- [📁 项目结构](#-项目结构)
- [🛠️ 技术栈](#️-技术栈)
- [📄 许可证](#-许可证)

## 🚀 快速开始

### 方式一：一键脚本（推荐）

最简单的方式，自动检测端口冲突并配置：

```bash
# 下载脚本
curl -fsSL https://raw.githubusercontent.com/foru17/clash-master/main/setup.sh | bash

# 或使用 wget
wget -qO- https://raw.githubusercontent.com/foru17/clash-master/main/setup.sh | bash
```

脚本会自动：
- ✅ 检测默认端口（3000/3001/3002）是否被占用
- ✅ 提供可用的替代端口
- ✅ 创建配置文件
- ✅ 启动服务

### 方式二：Docker Compose（手动）

创建 `docker-compose.yml`：

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
      - COLLECTOR_WS_PORT=3002
      - DB_PATH=/app/data/stats.db
```

启动服务：

```bash
docker compose up -d
```

访问 http://localhost:3000

### 方式三：使用 .env 配置文件

适合需要自定义端口的场景：

```bash
# 1. 下载配置文件
curl -O https://raw.githubusercontent.com/foru17/clash-master/main/.env.example
curl -O https://raw.githubusercontent.com/foru17/clash-master/main/docker-compose.yml

# 2. 重命名为 .env 并编辑
mv .env.example .env
# 修改 .env 中的端口

# 3. 启动
docker compose up -d
```

### 方式四：Docker 直接运行

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

## 📖 首次使用

![首次使用](./assets/clash-master-setup.png)

1. 打开 http://localhost:3000
2. 首次访问会弹出**后端配置**对话框
3. 填写 OpenClash 连接信息：
   - **名称**: 自定义名称（如 "Home"）
   - **地址**: OpenClash 后端地址（如 `192.168.101.1`）
   - **端口**: OpenClash 后端端口（如 `9090`）
   - **Token**: 如果配置了 Secret 则填写，否则留空
4. 点击「添加后端」保存配置
5. 系统将自动开始采集数据

> 💡 **获取 OpenClash 地址**: 进入 OpenClash 插件 → 打开「外部控制」→ 复制地址

## 🔧 端口冲突解决

如果看到错误提示端口已被占用，有以下几种解决方案：

### 方案 1：使用一键脚本（最简单）

```bash
./setup.sh
```

脚本会自动检测并提供可用的端口。

### 方案 2：使用 .env 文件

创建 `.env` 文件：

```bash
cp .env.example .env
```

修改端口为你想要的值：

```env
WEB_EXTERNAL_PORT=8080    # 修改 Web UI 端口
API_EXTERNAL_PORT=8081    # 修改 API 端口
WS_EXTERNAL_PORT=8082     # 修改 WebSocket 端口
```

然后重启：

```bash
docker compose down
docker compose up -d
```

现在访问 http://localhost:8080

### 方案 3：直接修改 docker-compose.yml

```yaml
ports:
  - "8080:3000"  # 外部 8080 → 内部 3000
  - "8081:3001"  # 外部 8081 → 内部 3001
  - "8082:3002"  # 外部 8082 → 内部 3002
environment:
  - NEXT_PUBLIC_WS_PORT=8082  # 告诉前端使用 8082
```

## 🐳 Docker 配置

### 端口说明

| 端口 |   用途    | 必需 | 说明          |
| :--: | :-------: | :--: | :------------ |
| 3000 | Web 界面  |  ✅  | 前端访问端口  |
| 3001 | API 接口  |  ✅  | REST API 端口 |
| 3002 | WebSocket |  ✅  | 实时数据传输  |

### 数据持久化

数据默认存储在容器内的 `/app/data` 目录，建议映射到宿主机：

```yaml
volumes:
  - ./data:/app/data
```

### 更新到最新版本

```bash
# 拉取最新镜像并重新启动
docker compose pull
docker compose up -d
```

## ❓ 常见问题

### Q: 提示 "端口已被占用" 怎么办？

**A:** 使用一键配置脚本，它会自动检测并提供可用端口：

```bash
./setup.sh
```

或者手动修改 `.env` 文件中的端口。

### Q: 修改端口后无法访问？

**A:** 确保三点：
1. `.env` 文件中的端口已修改
2. 重启了服务：`docker compose restart`
3. 访问时使用了新端口（如 `http://localhost:8080`）

### Q: 连接 OpenClash 失败？

**A:** 检查以下几点：
1. OpenClash 的「外部控制」是否已开启
2. OpenClash 地址是否正确（格式：`IP:端口`）
3. 如果配置了 Secret，Token 是否填写正确
4. 容器是否能访问到 OpenClash 所在网络

### Q: 如何查看服务日志？

**A:** 
```bash
# 查看所有日志
docker logs -f clash-master

# 只看最后 100 行
docker logs --tail 100 clash-master
```

### Q: 如何备份数据？

**A:** 数据存储在映射的目录中（默认 `./data/stats.db`）：

```bash
cp -r ./data ./data-backup-$(date +%Y%m%d)
```

### Q: 如何清理历史数据？

**A:** 
1. 点击左侧边栏底部的「后端配置」
2. 切换到「数据库」标签页
3. 选择清理范围：1天前 / 7天前 / 30天前 / 全部

### Q: 支持 ARM 架构吗？

**A:** 目前 Docker 镜像支持 `linux/amd64` 和 `linux/arm64`。

## 📁 项目结构

```
clash-master/
├── docker-compose.yml      # Docker Compose 配置
├── Dockerfile              # Docker 镜像构建
├── setup.sh                # 一键配置脚本 ⭐
├── docker-start.sh         # Docker 启动脚本
├── start.sh                # 源码启动脚本
├── .env.example            # 环境变量示例
├── assets/                 # 预览图和图标
├── apps/
│   ├── collector/          # 数据收集服务（Node.js + WebSocket）
│   └── web/                # Next.js 前端应用
└── packages/
    └── shared/             # 共享类型定义和工具
```

## 🛠️ 技术栈

- **前端**: Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **数据收集**: Node.js + WebSocket + SQLite
- **可视化**: Recharts + D3.js
- **部署**: Docker + Docker Compose

## 📄 许可证

MIT License © 2024 [foru17](https://github.com/foru17)

---

<p align="center">
  如果这个项目对你有帮助，请给个 ⭐ Star 支持一下！
</p>
