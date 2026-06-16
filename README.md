# 🎬 Xplora

> AI 驱动的电影管理与推荐系统 · Explore stories tailored for you

[![Stack](https://img.shields.io/badge/Stack-React+FastAPI-blueviolet)](#)
[![Frontend](https://img.shields.io/badge/Frontend-React_19+TypeScript_5.8-3178C6?logo=react)](#)
[![Backend](https://img.shields.io/badge/Backend-Python_3.12+FastAPI-009688?logo=fastapi)](#)

**English** | [中文](#中文)

---

**Xplora** is a full-stack movie management & recommendation system. Import movie data (JSON/CSV), manage watched/wishlist libraries, enrich metadata via TMDB, and get AI-powered recommendations (DeepSeek / OpenAI) — with a polished dark/light theme UI.

---

## 中文

Xplora 是一个全栈电影管理与推荐系统。支持 JSON/CSV 导入、已看/想看库管理、TMDB 元数据刮削、AI 智能推荐（DeepSeek / OpenAI），提供暗色/亮色主题切换和双语界面。

---

## 🚀 Quick Start

```bash
# 1. Clone & enter
git clone https://github.com/your-username/xplora.git
cd xplora

# 2. Configure API keys
cp .env.example .env
# Edit .env: add at least one AI key (DeepSeek/OpenAI) + TMDB key (recommended)

# 3. Start
docker compose up -d
```

Open **http://localhost:8327** — register an account and start managing your movies.

> **Poster caching:** posters are cached in a Docker volume by default. To persist to disk, bind-mount `./data/posters` and set `POSTER_STORAGE_DIR` in `.env`.

### Docker Commands

| Command | What it does |
|---------|-------------|
| `docker compose up -d` | Start in background |
| `docker compose logs -f` | Follow logs |
| `docker compose down` | Stop & remove |
| `docker compose pull` | Update to latest image |
| `docker compose up -d --build` | Rebuild & start |

---

## ✨ Features

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

---

## ⚙️ Configuration

Key environment variables (`.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | No\* | DeepSeek AI key |
| `OPENAI_API_KEY` | No\* | OpenAI AI key |
| `TMDB_API_KEY` | **Recommended** | TMDB API key (metadata, posters) |
| `JWT_SECRET` | No | Auto-generated; change in production |
| `DATABASE_URL` | No | Defaults to SQLite; PostgreSQL also supported |

*\* At least one AI key required for recommendations.*

Interactive API docs at **`/docs`** when the app is running.

---

## 🧪 Development

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && pnpm install && pnpm dev
```

Frontend at `http://localhost:5173` (proxies `/api` to backend). Backend API at `http://localhost:8000`.

---

## 📄 License

MIT
