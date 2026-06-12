FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
# Entorno de runtime explicito: el deploy nunca seteaba NODE_ENV, por lo que cualquier
# gate basado en 'production' (ej. Swagger) fallaba abierto. Lo declaramos aca para que
# el contenedor corra siempre en modo produccion salvo override explicito.
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs
COPY --chown=nestjs:nodejs package*.json ./
RUN npm ci --omit=dev
COPY --chown=nestjs:nodejs --from=builder /app/dist ./dist
USER nestjs
EXPOSE 3100
CMD ["node", "dist/main.js"]
