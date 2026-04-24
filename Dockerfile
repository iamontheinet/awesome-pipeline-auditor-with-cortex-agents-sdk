# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production (Debian-based for glibc — required by Cortex Code CLI)
FROM node:20-slim
WORKDIR /app

# Install snow CLI + Python connector
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl bash python3 python3-pip && \
    pip3 install --break-system-packages snowflake-cli snowflake-connector-python && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Cortex Code CLI (needed by Agent SDK)
RUN SKIP_PODMAN=1 sh -c 'curl -LsS https://ai.snowflake.com/static/cc-scripts/install.sh | sh'
ENV PATH="/root/.local/bin:${PATH}"

# Entrypoint writes connections.toml at boot from env vars + SPCS token
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Python SQL helper for SPCS-native auth
COPY server/snow_sql.py /app/snow_sql.py

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install production dependencies only
RUN npm ci --omit=dev

ENV NODE_ENV=production
ENV PORT=3001
ENV SNOW_CONNECTION=default
EXPOSE 3001

CMD ["/app/entrypoint.sh"]
