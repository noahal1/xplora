# =============================================================================
# Stage 1: Build frontend with Node.js
# =============================================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Cache npm dependencies
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile || pnpm install

# Copy frontend source and build
COPY frontend/ ./
RUN pnpm run build

# =============================================================================
# Stage 2: Build & Runtime (Python backend)
# =============================================================================
FROM python:3.12-slim AS runner

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Set working directory
WORKDIR /app

# Install system dependencies (minimal)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only requirements first to leverage Docker caching
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend application code
COPY backend/ ./backend/

# Copy pre-built frontend from the builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose the application port
EXPOSE 8327

# Run the application
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8327"]
