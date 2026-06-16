# =============================================================================
# Build args — override for CI (GitHub Actions) vs local (China mirrors)
# =============================================================================
ARG BASE_NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
ARG BASE_PYTHON_IMAGE=docker.m.daocloud.io/library/python:3.12-slim
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG APT_MIRROR_REPLACE=mirrors.aliyun.com
ARG PIP_MIRROR=https://mirrors.aliyun.com/pypi/simple/

# =============================================================================
# Stage 1: Build frontend with Node.js
# =============================================================================
FROM ${BASE_NODE_IMAGE} AS frontend-builder

ARG NPM_REGISTRY

WORKDIR /app/frontend

RUN npm config set registry ${NPM_REGISTRY}

COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm config set registry ${NPM_REGISTRY} && \
    pnpm install --no-frozen-lockfile --registry ${NPM_REGISTRY}

COPY frontend/ ./
RUN pnpm vite build

# =============================================================================
# Stage 2: Runtime — Python backend + frontend assets
# =============================================================================
FROM ${BASE_PYTHON_IMAGE}

ARG APT_MIRROR_REPLACE
ARG PIP_MIRROR

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
# Default: Aliyun mirror (China network). Override APT_MIRROR_REPLACE for CI.
RUN sed -i "s/deb.debian.org/${APT_MIRROR_REPLACE}/g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i "s/deb.debian.org/${APT_MIRROR_REPLACE}/g" /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Ensure SQLite database directory exists (baked into image)
RUN mkdir -p /app/data

# Verify sqlite3 works in this image
RUN python -c "import sqlite3; print(f'SQLite version: {sqlite3.sqlite_version}'); conn = sqlite3.connect('/tmp/test.db'); conn.execute('CREATE TABLE t(v)'); conn.execute('INSERT INTO t VALUES(1)'); print(conn.execute('SELECT * FROM t').fetchone()); conn.close(); print('SQLite: OK')"

# Copy and install Python dependencies (layer caching)
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -i ${PIP_MIRROR} -r backend/requirements.txt

# Copy backend application code
COPY backend/ ./backend/

# Copy pre-built frontend from builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose the application port
EXPOSE 8327

# Run the application
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8327"]
