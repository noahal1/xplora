# 🎬 Xplora — Movie explore and manage

> AI 驱动的电影管理系统 ·  Explore stories tailored for you

[![Tech Stack](https://img.shields.io/badge/Stack-React+FastAPI-blueviolet)](#)
[![Frontend](https://img.shields.io/badge/Frontend-React_19+TypeScript_5.8-3178C6?logo=react)](#)
[![Backend](https://img.shields.io/badge/Backend-Python_3.12+FastAPI-009688?logo=fastapi)](#)
[![CSS](https://img.shields.io/badge/Style-Tailwind_CSS_v4-06B6D4?logo=tailwindcss)](#)
[![AI](https://img.shields.io/badge/AI-DeepSeek+OpenAI-412991?logo=openai)](#)

---

**English** | [中文](#中文)

Xplora is a full-stack movie recommendation application that uses AI (DeepSeek / OpenAI) to analyze your movie ratings and suggest films you'll love. Import ratings from JSON/CSV files, manage your movie library, and get streaming AI recommendations — all with a sleek dark/light theme UI.

---

## 中文

Xplora 是一个全栈电影推荐应用，利用 AI（DeepSeek / OpenAI）分析你的观影评分，智能推荐你可能喜欢的影片。支持 JSON/CSV 文件导入、电影库管理、流式 AI 推荐，提供暗色/亮色主题切换。

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📥 Import Ratings** | Upload JSON/CSV files with drag-&-drop, or paste raw data. Supports Douban export format. |
| **🤖 AI Recommendations** | Streaming SSE-powered recommendations with DeepSeek or OpenAI. Follow-up chat included. |
| **📚 Movie Library** | Full CRUD management — search, sort, inline edit, batch operations, pagination. |
| **📊 History** | Browse past recommendation sessions with full details. |
| **🎨 Theme** | Dark/Light mode toggle, persisted to localStorage. |
| **📤 Export** | Download recommendations as JSON or screenshot (html2canvas). |
| **🐳 Docker** | One-command deployment with Docker Compose. |

## 🏗 Tech Stack

### Frontend (`frontend/`)

| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **TypeScript 5.8** | Type safety |
| **Vite 6** | Build tool & dev server |
| **Tailwind CSS v4** | Utility-first styling |
| **React Router v7** | Client-side routing |

### Backend (`backend/`)

| Technology | Purpose |
|------------|---------|
| **Python 3.12** | Runtime |
| **FastAPI** | REST API framework |
| **PostgreSQL** | Database (SQLAlchemy + SQLModel ORM) |
| **OpenAI SDK** | DeepSeek & OpenAI integration |
| **Uvicorn** | ASGI server |

### DevOps

| Tool | Purpose |
|------|---------|
| **Docker + Compose** | Containerized deployment |
| **pnpm** | Frontend package manager |

## 📁 Project Structure

```
Xplora/
├── backend/
│   ├── main.py           # FastAPI app, routes, middleware
│   ├── models.py         # Pydantic data models
│   ├── database.py       # SQLAlchemy ORM models & setup
│   ├── crud.py           # Database CRUD operations
│   ├── ai_service.py     # AI recommendation logic
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── main.tsx                # Entry point
│   │   ├── App.tsx                 # Root layout & routing
│   │   ├── style.css               # Tailwind + theme + @apply classes
│   │   ├── types/index.ts          # Shared TypeScript types
│   │   ├── api/index.ts            # API client (all endpoints)
│   │   ├── context/
│   │   │   ├── ThemeContext.tsx     # Dark/Light theme provider
│   │   │   └── ToastContext.tsx     # Toast notification system
│   │   ├── components/
│   │   │   ├── Header.tsx          # App header + theme toggle
│   │   │   ├── Footer.tsx          # App footer
│   │   │   ├── TabNav.tsx          # Navigation tabs (Recommend / Manage)
│   │   │   ├── RecommendTab.tsx    # Import + recommend + chat UI
│   │   │   ├── ManageTab.tsx       # Movie library management
│   │   │   ├── HistorySidebar.tsx  # Recommendation history panel
│   │   │   ├── Stars.tsx           ⭐ Rating stars component
│   │   │   ├── Pagination.tsx      # Paginated navigation
│   │   │   └── Modal.tsx           # Reusable modal dialog
│   ├── index.html               # Vite entry HTML
│   ├── package.json
│   ├── utils/
│   │   ├── csv.ts              # CSV file parsing
│   │   ├── rating.ts            # Rating normalization
│   │   └── export.ts            # JSON/screenshot export helpers
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── .dockerignore
├── docker-compose.yml
├── Dockerfile
└── README.md (this file)
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18 + **pnpm**
- **Python** ≥ 3.12 + **pip**
- **AI API Key** — [DeepSeek](https://platform.deepseek.com/) or [OpenAI](https://platform.openai.com/)

### 1. Backend Setup

```bash
# Copy environment template and fill in your keys
cp .env.example .env
# Then edit .env to add your API keys (see Configuration section below)

# Install dependencies
cd backend
pip install -r requirements.txt

# Start the server (requires DATABASE_URL — see Configuration below)
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Visit `http://localhost:8000/docs` for interactive Swagger docs.

> **Database:** Xplora requires PostgreSQL. Set `DATABASE_URL` in `.env`:
> ```
> DATABASE_URL=postgresql://user:password@localhost:5432/Xplora
> ```

### 2. Frontend Setup

```bash
cd frontend
pnpm install
pnpm dev
```

The frontend will start at `http://localhost:5173` and proxy `/api` requests to the backend.

## 🔧 Configuration

### Environment Variables (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/Xplora` |
| `DB_POOL_SIZE` | No | `10` | PostgreSQL connection pool size (base connections) |
| `DB_MAX_OVERFLOW` | No | `20` | Extra connections beyond pool size during bursts |
| `DB_POOL_TIMEOUT` | No | `30` | Seconds to wait for a pool connection |
| `DB_POOL_RECYCLE` | No | `1800` | Seconds after which idle connections are recycled |
| `DB_POOL_PRE_PING` | No | `true` | Verify connection before use (`true`/`false`) |
| `DEEPSEEK_API_KEY` | No* | — | DeepSeek AI API key |
| `OPENAI_API_KEY` | No* | — | OpenAI API key |
| `TMDB_API_KEY` | No | — | TMDB API key (for movie metadata scraping) |
| `OMDB_API_KEY` | No | — | OMDb API key (fallback movie search) |
| `JWT_SECRET` | No | `Xplora-dev-secret-...` | JWT signing secret — **change in production** |

*\* At least one AI API key is required for recommendations. TMDB key is recommended for metadata/poster scraping.*

### Frontend Proxy (`vite.config.ts`)

```ts
server: {
  proxy: {
    "/api": {
      target: "http://localhost:8000",
      changeOrigin: true,
    },
  },
}
```

## 📡 API Reference

All endpoints are prefixed with `/api`. Interactive docs available at `/docs` when the backend is running.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check & model availability |
| `POST` | `/api/recommend` | Get recommendations (non-streaming) |
| `POST` | `/api/recommend/stream` | **SSE** Streaming recommendations |
| `POST` | `/api/recommend/followup` | **SSE** Follow-up chat |
| `POST` | `/api/recommend/upload` | Upload JSON file for recommendations |
| `POST` | `/api/movies/replace` | Replace all movies in library |
| `GET` | `/api/movies` | List movies (search + pagination) |
| `PUT` | `/api/movies/{id}` | Update a movie |
| `DELETE` | `/api/movies/{id}` | Delete a movie |
| `DELETE` | `/api/movies` | Delete all movies |
| `GET` | `/api/sessions` | List recommendation sessions |
| `GET` | `/api/sessions/{id}` | Get session detail |
| `DELETE` | `/api/sessions/{id}` | Delete a session |

### SSE Event Stream Format

The streaming endpoints (`/stream`, `/followup`) emit Server-Sent Events:

```
event: start
data: {"model": "deepseek", "source_count": 5}

event: recommendation
data: {"title": "Inception", "year": 2010, "genre": "Sci-Fi", "reason": "...", "confidence": 0.92}

event: done
data: {"model_used": "deepseek", "source_count": 5, "total": 5}
```

## 🎨 Theme System

The app supports **Dark** (default) and **Light** themes via CSS custom properties.

### How it works

1. **CSS variables** are defined in `:root` (dark) and overridden in `.light` (light)
2. **Tailwind's `@theme`** block maps custom colors (`bg-card`, `text-fg`, `border-line`, etc.)
3. **`ThemeContext`** manages the toggle, persists the choice to `localStorage` (`Xplora-theme`), and detects system preference via `prefers-color-scheme`
4. A global `transition` on `*` ensures smooth color transitions

### Theme colors

| Token | Dark | Light |
|-------|------|-------|
| `page` | `#0a0a0f` | `#f0f2f5` |
| `card` | `#1a1a2e` | `#ffffff` |
| `input` | `#16162b` | `#e4e6eb` |
| `line` | `#2a2a45` | `#d0d4dc` |
| `fg` | `#e8e8f0` | `#1a1a2e` |
| `blue` | `#6366f1` | `#6366f1` |

## 🧩 Reusable CSS Components

Tailwind class combinations are extracted into reusable `@apply` directives in `style.css`:

| Class | Usage |
|-------|-------|
| `.btn-primary` | Gradient primary action button |
| `.btn-secondary` | Secondary outlined button |
| `.btn-outline` | Ghost button |
| `.btn-page` | Small pagination button |
| `.input-base` | Form input field |
| `.section-card` | Card container with border |
| `.section-header` | Flex header row |
| `.spinner` | Loading spinner |
| `.badge-*` | Colored tags/labels |
| `.close-btn` | Absolute-positioned close button |
| `.history-item` | History sidebar item |
| `.icon-btn` | Small icon delete button |

## 🐳 Docker Deployment

```bash
# Build & start
docker compose up -d

# The app will be available at http://localhost:8327
# No separate frontend build needed — served by FastAPI

# View logs
docker compose logs -f

# Stop
docker compose down
```

The Docker setup:
- **PostgreSQL 16** as the database (`Xplora-db` container) with persistent volume
- Uses a `python:3.12-slim` image for the app
- Serves the frontend build via FastAPI's `StaticFiles`
- Exposes port `8327`
- `recommender` container waits for PostgreSQL health check before starting
- Includes a health check at `/api/health`

## 🌐 Nginx Reverse Proxy (Optional)

When deploying behind a reverse proxy, Nginx can cache poster images
aggressively so the browser never needs to re-request them — especially
useful since posters are immutable (filenames include a hash or TMDB ID).

### Configuration

A ready-to-use config is provided in [`nginx.conf`](nginx.conf).
Place it in your Nginx sites directory:

```bash
sudo cp nginx.conf /etc/nginx/sites-available/Xplora
sudo ln -s /etc/nginx/sites-available/Xplora /etc/nginx/sites-enabled/

# Edit the server_name and adjust proxy_pass if needed
sudo nano /etc/nginx/sites-available/Xplora

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

### What it does

| Directive | Effect |
|-----------|--------|
| `expires 1y` | Browser caches posters for 1 year — zero requests on repeat visits |
| `Cache-Control: public, immutable` | Tells the browser the file will never change at that URL |
| `proxy_set_header Cookie ""` | Strips auth cookies from poster requests (saves bandwidth) |

Posters are served through FastAPI (at `/static/posters/`), which reads
them from a local directory. Nginx adds the caching headers on top.

### Local testing

```bash
# Run nginx locally (adjust listen to 127.0.0.1:8080 in the config first)
nginx -c /absolute/path/to/Xplora/nginx.conf
```

> Port 80 requires `sudo`; for local testing, change `listen 80;` to
> `listen 127.0.0.1:8080;` so you can run without root.

## 🧪 Development

```bash
# Frontend typecheck
cd frontend && npx tsc -b --noEmit

# Frontend build
cd frontend && pnpm build

# Backend (with auto-reload)
cd backend && uvicorn main:app --reload --port 8000
```

## 📄 License

MIT
