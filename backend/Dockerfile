FROM node:22-alpine AS builder
RUN apk add --no-cache font-liberation fontconfig
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN ./node_modules/.bin/prisma generate
RUN npm run build

FROM node:22-alpine AS production
RUN apk add --no-cache font-liberation fontconfig
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
COPY prisma ./prisma

EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["/bin/sh", "-c", \
  "node_modules/.bin/prisma migrate deploy && node dist/src/main.js"]
