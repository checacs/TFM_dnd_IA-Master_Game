# UI web (React + Vite) servida por nginx. nginx también hace de proxy de /api
# hacia la API (ver nginx.conf), así que el navegador habla con un único origen
# y no hace falta configurar CORS ni la URL de la API en tiempo de build.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Vite incrusta VITE_API_URL al compilar. Una variable de entorno tiene
# prioridad sobre los ficheros .env (y .env.production, que trae un
# placeholder, está excluido en .dockerignore).
ENV VITE_API_URL=/api
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
