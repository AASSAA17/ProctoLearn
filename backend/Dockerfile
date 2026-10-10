FROM node:24-alpine AS builder
RUN apk add --no-cache openssl font-liberation fontconfig
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN node_modules/.bin/prisma generate && npm run build
RUN cp prisma/demo-seed.cjs dist/prisma/demo-seed.cjs && npm prune --omit=dev

FROM node:24-alpine AS production
RUN apk add --no-cache openssl font-liberation fontconfig
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/assets ./assets
COPY --chown=node:node docker ./docker
USER node

EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.API_PORT || '4000') +'/ready',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/bin/sh", "/app/docker/entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
