# Motor del DM-IA (Express + DeepSeek + cliente MCP). Multi-etapa: compila a
# dist/ y deja solo las dependencias de producción en la imagen final.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# `npm install` y no `npm ci`: el package-lock.json de dm-engine tiene
# "typescript" como devDependency y el package.json como dependency, y npm ci
# rechaza un lock desincronizado. Si regeneras el lock (npm install en local y
# commit), puedes cambiar esto a `npm ci`.
RUN npm install --no-audit --no-fund
COPY . .
# tsconfig.build.json = tsconfig.json sin los *.spec.ts (no hacen falta en la imagen).
RUN npx tsc -p tsconfig.build.json && npm prune --omit=dev

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
