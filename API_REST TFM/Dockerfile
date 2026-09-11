# API REST + servidor MCP (NestJS). Imagen multi-etapa:
#   deps    -> todas las dependencias (incluidas las de desarrollo) + código fuente.
#              La usa también el servicio "seed" de docker-compose (ts-node + scripts/).
#   build   -> compila TypeScript a dist/ y poda las dependencias de desarrollo.
#   runtime -> solo dist/, assets/ y dependencias de producción.
# node:22-slim (glibc, no alpine) para que bcrypt use sus binarios precompilados.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

FROM deps AS build
# tsconfig.build.json = tsconfig.json sin los *.spec.ts (no hacen falta en la imagen).
RUN npx tsc -p tsconfig.build.json && npm prune --omit=dev

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# main.ts sirve assets/maps y assets/music como estáticos (../assets respecto a dist/).
COPY --from=build /app/assets ./assets
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
