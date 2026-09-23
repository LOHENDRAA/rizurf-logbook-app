# Web tier: builds the SPA from source, then serves it with nginx while
# proxying /api/* and /sanctum/* to the php-fpm app via FastCGI.
# Build context is the monorepo root.
FROM node:22-bookworm-slim AS spa
WORKDIR /spa
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:stable
COPY --from=spa /spa/dist/ /usr/share/nginx/html/
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
