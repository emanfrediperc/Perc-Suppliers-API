FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs
COPY --chown=nestjs:nodejs package*.json ./
RUN npm ci --omit=dev
COPY --chown=nestjs:nodejs --from=builder /app/dist ./dist
USER nestjs
EXPOSE 3100
CMD ["node", "dist/main.js"]
