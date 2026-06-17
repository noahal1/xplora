# 🎬 Xplora

> AI 驱动的电影管理与推荐系统 · Explore stories tailored for you

[![Stack](https://img.shields.io/badge/Stack-React+FastAPI-blueviolet)](#)
[![Frontend](https://img.shields.io/badge/Frontend-React_19+TypeScript_5.8-3178C6?logo=react)](#)
[![Backend](https://img.shields.io/badge/Backend-Python_3.12+FastAPI-009688?logo=fastapi)](#)

---

## English

**Xplora** is a full-stack movie management & recommendation system. Import movie data (JSON/CSV), manage watched/wishlist libraries, enrich metadata via TMDB, and get AI-powered recommendations (DeepSeek / OpenAI) — with a polished dark/light theme UI.

---

## 中文

**Xplora** 是一个全栈电影管理与推荐系统。支持 JSON/CSV 导入观影记录，管理「看过」和「想看」片单，自动从 TMDB 刮削海报、导演、演员等元数据，并通过 DeepSeek 或 OpenAI 获得 AI 智能推荐。界面支持暗色/亮色主题切换与中英双语，开箱即用。

---

## 🚀 Quick Start / 快速开始

### Docker（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/your-username/xplora.git
cd xplora

# 2. 配置 API 密钥
cp .env.example .env
# 编辑 .env：至少配置一个 AI 密钥（DeepSeek/OpenAI），建议同时配置 TMDB 密钥

# 3. 启动服务
docker compose up -d
```

打开 **http://localhost:8327** — 注册账号即可开始管理你的电影库。

> **海报缓存：** 海报默认缓存在 Docker 卷中。如需持久化到磁盘，请挂载 `./data/posters` 并在 `.env` 中设置 `POSTER_STORAGE_DIR`。

### Docker 命令速查

| 命令 | 说明 |
|------|------|
| `docker compose up -d` | 后台启动 |
| `docker compose logs -f` | 查看实时日志 |
| `docker compose down` | 停止并移除容器 |
| `docker compose pull` | 更新到最新镜像 |
| `docker compose up -d --build` | 重新构建并启动 |

---

## ✨ Features / 功能特性

### English

- **Watched Library** — grid/table views, inline editing, batch rating
- **Wishlist** — track movies to watch; search & import from TMDB/OMDb/TVmaze
- **AI Recommendations** — streaming SSE recs via DeepSeek or OpenAI
- **Import/Export** — drag-&-drop JSON/CSV, export as JSON or screenshot
- **External Search** — TMDB, OMDb, TVmaze → add results to your library
- **Metadata Enrichment** — auto-fetch posters, directors, cast from TMDB
- **Poster Cache** — automatic download & local caching
- **Multi-User Auth** — JWT auth, role-based admin panel
- **TV Series** — track series with season/episode metadata
- **i18n** — English & 中文, hot-switchable
- **Theme** — Dark/Light toggle

### 中文

- **「看过」库** — 网格/表格双视图，内联编辑，批量评分
- **「想看」清单** — 追踪想看的电影，从 TMDB/OMDb/TVmaze 搜索导入
- **AI 智能推荐** — 基于 DeepSeek 或 OpenAI 的 SSE 流式推荐
- **导入/导出** — 拖拽导入 JSON/CSV，导出为 JSON 或截图
- **外部搜索** — TMDB、OMDb、TVmaze → 一键添加到片库
- **元数据刮削** — 自动获取海报、导演、演员等信息
- **海报缓存** — 自动下载并本地缓存海报
- **多用户认证** — JWT 认证，基于角色的管理员面板
- **剧集支持** — 记录剧集，包含季/集元数据
- **双语界面** — 英文 & 中文，支持一键切换
- **主题切换** — 暗色/亮色模式自由切换

---

## ⚙️ Configuration / 配置说明

### Environment Variables / 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DEEPSEEK_API_KEY` | 否\* | DeepSeek AI 密钥 |
| `OPENAI_API_KEY` | 否\* | OpenAI AI 密钥 |
| `TMDB_API_KEY` | **推荐** | TMDB API 密钥（元数据、海报） |
| `JWT_SECRET` | 否 | 自动生成；生产环境建议自定义 |
| `DATABASE_URL` | 否 | 默认 SQLite；也支持 PostgreSQL |

*\* AI 推荐功能至少需要配置一个 AI 密钥。*

### Interactive API Docs / 交互式 API 文档

启动应用后访问 **`/docs`**（如 http://localhost:8327/docs）可查看 Swagger 文档。

---

## 🧪 Development / 本地开发

### English

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && pnpm install && pnpm dev
```

Frontend at `http://localhost:5173` (proxies `/api` to backend). Backend API at `http://localhost:8000`.

### 中文

```bash
# 后端
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 前端（新开一个终端）
cd frontend && pnpm install && pnpm dev
```

前端访问 `http://localhost:5173`（自动代理 `/api` 到后端）。后端 API 地址 `http://localhost:8000`。

---

## 📄 License / 许可证

MIT

---

> Built with ❤️ using React 19, FastAPI, SQLite/PostgreSQL, and Docker.
