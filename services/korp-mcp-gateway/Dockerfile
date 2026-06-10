FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json vitest.config.ts ./
COPY src ./src
RUN npm install && npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8787/ready || exit 1
CMD ["node", "dist/index.js"]
