# 🎬 Xplora — Movie Explore & Manage

> AI 驱动的电影管理系统 · Explore stories tailored for you

[![Tech Stack](https://img.shields.io/badge/Stack-React+FastAPI-blueviolet)](#)
[![Frontend](https://img.shields.io/badge/Frontend-React_19+TypeScript_5.8-3178C6?logo=react)](#)
[![Backend](https://img.shields.io/badge/Backend-Python_3.12+FastAPI-009688?logo=fastapi)](#)
[![CSS](https://img.shields.io/badge/Style-Tailwind_CSS_v4-06B6D4?logo=tailwindcss)](#)
[![AI](https://img.shields.io/badge/AI-DeepSeek+OpenAI-412991?logo=openai)](#)

---

**English** | [中文](#中文)

Xplora is a full-stack movie management and recommendation system. It uses AI (DeepSeek / OpenAI) to analyze your ratings and recommend films you'll love. Import movie data from JSON/CSV, manage watched/wishlist libraries, enrich metadata via TMDB, and get streaming AI recommendations — all with a polished dark/light theme UI.

---

## 中文

Xplora 是一个全栈电影管理与推荐系统。利用 AI（DeepSeek / OpenAI）分析你的观影评分，智能推荐你可能喜欢的影片。支持 JSON/CSV 导入、已看/想看库管理、TMDB 元数据刮削、流式 AI 推荐，提供暗色/亮色主题切换和多语言界面。

---

## 🚀 Quick Start — Docker

> Docker is the recommended way to run Xplora. One command, zero dependencies.

### Prerequisites

- **Docker** & **Docker Compose** installed on your machine
- **AI API Key** — [DeepSeek](https://platform.deepseek.com/) and/or [OpenAI](https://platform.openai.com/)
- **TMDB API Key** (recommended) — [Get one free](https://www.themoviedb.org/settings/api)

### 1. Get the project

```bash
git clone https://github.com/your-username/xplora.git
cd xplora
```

### 2. Configure API keys

Create a `.env` file in the project root:

```bash
cp .env.example .env
# Then edit .env to add your API keys
```

Minimal `.env` example:

```ini
# At least one AI API key is required for recommendations
DEEPSEEK_API_KEY=sk-your-deepseek-key
# OPENAI_API_KEY=sk-your-openai-key

# TMDB is strongly recommended for poster fetching & metadata enrichment
TMDB_API_KEY=your-tmdb-api-key

# JWT secret — change this in production!
JWT_SECRET=your-random-secret-string
```

### 3. Start the app

```bash
docker compose up -d
```

The app will be available at **http://localhost:8327**.

- First visit: register an account → start managing your movies
- The database (SQLite) persists automatically in `./data/`
- Posters are cached in a Docker volume

### 4. Poster cache configuration (optional)

By default, posters are cached in a Docker named volume. If you want poster files to persist on your local disk instead, update `docker-compose.yml` to use a bind mount:

volumes:
 ./data:/app/data
./data/posters:/app/backend/static/posters


Then remove the orphaned named volume at the bottom of `docker-compose.yml`:

To use a different directory inside the container, add `POSTER_STORAGE_DIR` to your `.env` file and update the bind mount accordingly:

```ini
# .env — custom poster path inside the container
POSTER_STORAGE_DIR=/app/data/posters
```

```yaml
# docker-compose.yml — bind mount must match POSTER_STORAGE_DIR
volumes:
  - ./data:/app/data
  - ./data/posters:/app/data/posters
```

### Common Docker commands

| Command | What it does |
|---------|-------------|
| `docker compose up -d` | Start in background |
| `docker compose logs -f` | Follow logs |
| `docker compose down` | Stop & remove container |
| `docker compose pull` | Update to latest image |
| `docker compose up -d --build` | Rebuild & start (after code changes) |

---

## ⚙️ Detailed Configuration

### Environment Variables (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `sqlite:////app/data/xplora.db` | Database connection string. SQLite by default; PostgreSQL also supported. |
| `DEEPSEEK_API_KEY` | No* | — | DeepSeek AI API key |
| `OPENAI_API_KEY` | No* | — | OpenAI API key |
| `TMDB_API_KEY` | **Recommended** | — | TMDB API key (metadata scraping, poster fetching) |
| `OMDB_API_KEY` | No | — | OMDb API key (fallback movie search) |
| `JWT_SECRET` | No | Auto-generated | JWT signing secret — **change in production** |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `JWT_EXPIRE_MINUTES` | No | `10080` | JWT token expiry (7 days) |
| `DB_POOL_SIZE` | No | `10` | PostgreSQL pool connections (base) |
| `DB_MAX_OVERFLOW` | No | `20` | Extra PostgreSQL connections during bursts |
| `DB_POOL_TIMEOUT` | No | `30` | Seconds to wait for a pool connection |
| `DB_POOL_RECYCLE` | No | `1800` | Seconds after which idle connections recycle |
| `DB_POOL_PRE_PING` | No | `true` | Verify connection before use |
| `POSTER_STORAGE_DIR` | No | `backend/static/posters/` | Poster image cache directory (inside container: `backend/static/posters/`) |

*\* At least one AI API key required for recommendations. TMDB is strongly recommended.*

### Using PostgreSQL (optional)

By default Xplora uses SQLite — no setup needed. To use PostgreSQL, change `DATABASE_URL` in `.env`:

```ini
DATABASE_URL=postgresql://user:password@host:5432/xplora
```

Note: when using Docker, you'll need a separate PostgreSQL container. Add it to your `docker-compose.yml` or use an external instance.

### Nginx Reverse Proxy (optional)

When deploying behind Nginx, posters can be cached aggressively. A ready-to-use config is in [`nginx.conf`](nginx.conf).

```bash
sudo cp nginx.conf /etc/nginx/sites-available/xplora
sudo ln -s /etc/nginx/sites-available/xplora /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Key caching: `expires 1y` + `Cache-Control: public, immutable` for poster images.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **👁️ Watched Library** | Grid/table views, inline editing, batch rating, full CRUD. |
| **⭐ Wishlist** | Track movies to watch; search & import from TMDB/OMDb/TVmaze. |
| **📥 Import** | Drag-&-drop JSON/CSV upload or paste raw data. Douban format supported. |
| **🤖 AI Recommendations** | Streaming SSE recommendations via DeepSeek or OpenAI. Follow-up chat. |
| **🔍 External Search** | Search TMDB, OMDb, TVmaze — add results directly to your library. |
| **📚 Movie Library** | Full CRUD with search, sort, inline edit, batch ops, genre filtering. |
| **📺 TV Series** | Track series with season/episode metadata, TVmaze integration. |
| **🖼️ Poster Cache** | Automatic poster download & local caching via Docker volume. |
| **🔄 Metadata Enrichment** | Auto-fetch posters, directors, cast, overview from TMDB. |
| **📊 History** | Browse past recommendation sessions with full details. |
| **👤 Multi-User Auth** | JWT auth with register/login, role-based admin panel. |
| **🔧 Admin Panel** | User management, password reset, data export, operation logs. |
| **🌐 i18n** | English & 中文, hot-switchable from header. |
| **🎨 Theme** | Dark/Light toggle, persisted to localStorage. |
| **📤 Export** | Download as JSON or screenshot (html2canvas). |

---

## 📁 Project Structure

```text
xplora/
├── docker-compose.yml         # One-command deployment
├── Dockerfile                 # Container build
├── nginx.conf                 # Optional reverse proxy config
├── .env                       # API keys & config (create this)
├── data/                      # SQLite database (auto-created)
│
├── backend/
│   ├── main.py                # FastAPI app factory, lifespan, static serving
│   ├── database.py            # SQLAlchemy engine & session setup
│   ├── config_manager.py      # Environment config & API key status
│   ├── auth.py                # JWT token creation & verification
│   ├── helpers.py             # Utility functions
│   ├── http_client.py         # Shared async HTTP client
│   ├── movie_search.py        # TMDB/OMDb/TVmaze search abstraction
│   ├── poster_cache.py        # Poster download & local caching
│   ├── engine.py              # AI recommendation engine
│   ├── ai_service.py          # AI recommendation service logic
│   ├── recache_posters.py     # Standalone poster recache script
│   ├── requirements.txt
│   ├── models/
│   │   ├── db.py              # SQLModel ORM models
│   │   └── schemas.py         # Pydantic request/response schemas
│   ├── routers/
│   │   ├── auth.py, media.py, recommend.py, sessions.py
│   │   ├── user_data.py, admin.py, logs.py
│   ├── crud/
│   │   ├── media.py, sessions.py, users.py, logs.py
│   └── scraper/
│       ├── search.py          # External API searches
│       ├── match.py           # Title matching
│       └── background.py      # Background enrichment runner
│
├── frontend/
│   ├── index.html, package.json, vite.config.ts
│   └── src/
│       ├── App.tsx            # Root layout & routing
│       ├── style.css          # Tailwind v4 + theme variables
│       ├── api/index.ts       # Full API client
│       ├── types/index.ts     # TypeScript types
│       ├── context/           # Theme, Auth, Toast, History, Enrich
│       ├── hooks/             # useDebouncedSearch, usePagination, etc.
│       ├── i18n/locales/      # en-US.json, zh-CN.json
│       ├── pages/             # LoginPage, ProfilePage, AdminPanel
│       ├── utils/             # csv, date, export, genre helpers
│       └── components/
│           ├── Header.tsx, Footer.tsx, TabNav.tsx
│           ├── RecommendTab.tsx      # AI recommendations + chat
│           ├── WatchedTab.tsx        # Watched library (grid/table)
│           ├── HistoryTab.tsx        # Recommendation session history
│           ├── HistorySidebar.tsx    # History panel sidebar
│           ├── ManageTab/            # Library management
│           │   ├── index.tsx
│           │   ├── DetailModal.tsx, GenreEditModal.tsx
│           │   ├── MarkWatchedModal.tsx, RematchModal.tsx
│           │   └── SearchImportModal.tsx
│           ├── WishlistTab/          # Want-to-watch
│           │   ├── index.tsx, DetailModal.tsx, RatingModal.tsx
│           ├── ui/                   # Radix UI primitives
│           │   ├── button.tsx, dialog.tsx, input.tsx, badge.tsx
│           │   ├── card.tsx, tabs.tsx, table.tsx, slider.tsx
│           │   ├── checkbox.tsx, separator.tsx, sonner.tsx
│           ├── UserMenu.tsx, LanguageSwitcher.tsx, Logo.tsx
│           ├── Modal.tsx, Pagination.tsx, Skeleton.tsx
│           └── Animated: Aurora.tsx, Orb.tsx, BlurText.tsx, etc.
└── README.md
```

---

## 🏗 Tech Stack

### Frontend

React 19 · TypeScript 5.8 · Vite 8 · Tailwind CSS v4 · React Router v7 · Radix UI · i18next · Lucide React · GSAP · sonner · html2canvas · OGL

### Backend

Python 3.12 · FastAPI · SQLite / PostgreSQL · SQLModel (SQLAlchemy + Pydantic) · OpenAI SDK · httpx · python-jose · passlib + bcrypt · Uvicorn

---

## 📡 API Reference

All endpoints are prefixed with `/api`. Interactive Swagger docs at `/docs` when the app is running.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register |
| `POST` | `/api/auth/login` | Login → JWT |
| `GET` | `/api/auth/me` | Current user |
| `PUT` | `/api/auth/password` | Change password |

### Media (Watched Library)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/media` | List (search, paginate, filter) |
| `POST` | `/api/media` | Add single item |
| `PUT` | `/api/media/{id}` | Update metadata |
| `DELETE` | `/api/media/{id}` | Delete single |
| `POST` | `/api/media/replace` | Batch import (replace all) |
| `POST` | `/api/media/batch-delete` | Batch delete by IDs |
| `GET` | `/api/media/titles` | All titles (dedup check) |
| `POST` | `/api/media/{id}/mark-watched` | Wishlist → Watched |
| `POST` | `/api/media/search` | Search TMDB/OMDb/TVmaze |
| `GET` | `/api/media/detail` | External detail by source ID |
| `POST` | `/api/media/{id}/enrich` | Enrich metadata from TMDB |
| `POST` | `/api/media/enrich-all` | Enrich all without posters |
| `POST` | `/api/media/cache-posters` | Cache posters locally |
| `GET` | `/api/media/enrich-status` | Enrichment progress |
| `POST` | `/api/media/{id}/rematch` | Re-match to search result |

### Wishlist

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/wishlist` | List |
| `POST` | `/api/wishlist` | Add |
| `PUT` | `/api/wishlist/{id}` | Update |
| `DELETE` | `/api/wishlist` | Clear all |
| `DELETE` | `/api/wishlist/{id}` | Remove single |
| `POST` | `/api/wishlist/replace` | Replace all |
| `POST` | `/api/wishlist/import` | Append (no clear) |
| `POST` | `/api/wishlist/search` | External search |

### Recommendations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/recommend` | Non-streaming |
| `POST` | `/api/recommend/stream` | **SSE** Streaming |
| `POST` | `/api/recommend/followup` | **SSE** Follow-up chat |
| `POST` | `/api/recommend/upload` | Upload data for recs |

### Sessions (History)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List sessions |
| `GET` | `/api/sessions/{id}` | Session detail |
| `DELETE` | `/api/sessions/{id}` | Delete session |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List users |
| `DELETE` | `/api/auth/users/{id}` | Delete user |
| `POST` | `/api/auth/users/{id}/reset-password` | Reset password |
| `GET` | `/api/admin/export` | Export all data as JSON |

### Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/logs` | Operation logs (admin) |

### SSE Event Format

```text
event: start
data: {"model": "deepseek", "source_count": 5}

event: recommendation
data: {"title": "Inception", "year": 2010, "genre": "Sci-Fi",
       "reason": "You rated Nolan's films highly...", "confidence": 0.92}

event: done
data: {"model_used": "deepseek", "source_count": 5, "total": 5}
```

---

## 🧪 Development (without Docker)

### Prerequisites

- **Node.js** ≥ 18 + **pnpm**
- **Python** ≥ 3.12 + **pip**

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API at `http://localhost:8000`, Swagger docs at `/docs`.

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend at `http://localhost:5173` (proxies `/api` to backend).

### Build for production

```bash
cd frontend && pnpm build
# Backend serves the built files automatically via FastAPI StaticFiles
```

### Typecheck

```bash
cd frontend && npx tsc -b --noEmit
```

---

## 📄 License

MIT
