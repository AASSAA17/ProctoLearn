FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN ./node_modules/.bin/prisma generate
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY prisma ./prisma

EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 \
  CMD wget -qO- http://localhost:4000/api/docs-json || exit 1
CMD ["/bin/sh", "-c", \
  "until node_modules/.bin/prisma db push --accept-data-loss; do echo 'Waiting for DB...'; sleep 3; done && node_modules/.bin/prisma db seed && node dist/main.js"]
