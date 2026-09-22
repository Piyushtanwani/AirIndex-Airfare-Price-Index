# AirIndex dashboard.
#
# Development server rather than a static build, because the demonstration wants hot
# reload and the dashboard is not the thing being deployed. For a real deployment, build
# with `npm run build` and serve the `dist` directory from any static host.

# Stage 1: Build the static application
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Allow passing VITE_API_URL at build time
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Stage 2: Serve the application using Nginx
FROM nginx:alpine

# Copy the built assets from the build stage to the Nginx html directory
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
