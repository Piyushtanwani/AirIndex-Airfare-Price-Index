# AirIndex dashboard.
#
# Development server rather than a static build, because the demonstration wants hot
# reload and the dashboard is not the thing being deployed. For a real deployment, build
# with `npm run build` and serve the `dist` directory from any static host.

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
