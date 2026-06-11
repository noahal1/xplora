# =============================================================================
# Stage 1: Build frontend with Node.js
# =============================================================================
FROM docker.m.daocloud.io/library/node:22-alpine AS frontend-builder

WORKDIR /app/frontend

RUN npm config set registry https://registry.npmmirror.com

COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --no-frozen-lockfile --registry https://registry.npmmirror.com

COPY frontend/ ./
RUN pnpm vite build

# =============================================================================
# Stage 2: Runtime — Python backend + frontend assets
# =============================================================================
FROM docker.m.daocloud.io/library/python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app/backend \
    DATABASE_URL=sqlite:////app/data/xplora.db

# Set working directory
WORKDIR /app

# Install system dependencies (minimal — curl for healthcheck)
# Use Aliyun mirror for apt (China network)
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Ensure SQLite database directory exists (baked into image)
RUN mkdir -p /app/data

# Verify sqlite3 works in this image
RUN python -c "import sqlite3; print(f'SQLite version: {sqlite3.sqlite_version}'); conn = sqlite3.connect('/tmp/test.db'); conn.execute('CREATE TABLE t(v)'); conn.execute('INSERT INTO t VALUES(1)'); print(conn.execute('SELECT * FROM t').fetchone()); conn.close(); print('SQLite: OK')"

# Copy and install Python dependencies (layer caching)
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ -r backend/requirements.txt

# Copy backend application code
COPY backend/ ./backend/

# Copy pre-built frontend from builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose the application port
EXPOSE 8327

# Run the application
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8327"]
