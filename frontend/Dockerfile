# ==============================================================================
# AirIndex Frontend Dashboard - Production Multi-Stage Dockerfile
# ==============================================================================
# Stage 1: Build the static Vite/React application
# Stage 2: Serve the optimized production assets with Nginx
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build
# ------------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (layer caching optimization)
COPY package*.json ./
RUN npm ci

# Copy application source code
COPY . .

# Build-time environment variables for Vite
# Note: Vite statically inlines VITE_* environment variables during build time.
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_API_KEY=""

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_KEY=$VITE_API_KEY

# Compile TypeScript and bundle with Vite
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Nginx Server
# ------------------------------------------------------------------------------
FROM nginx:1.27-alpine

# Remove default Nginx welcome page and configs
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration supporting SPA routing and gzip
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose standard HTTP port
EXPOSE 80

# Healthcheck to ensure Nginx is actively responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:80/healthz || exit 1

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
