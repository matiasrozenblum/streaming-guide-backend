FROM node:22-alpine

# Instalar Chromium + dependencias necesarias
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn \
    bash

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# 👉🏻 Acá todavía NO seteamos NODE_ENV
# Instalamos TODO (dependencias de producción + desarrollo)
RUN npm install

# Copiar el resto del proyecto
COPY . .

# Build del proyecto Nest.js
RUN npm run build

# 👉🏻 recién acá seteamos NODE_ENV=production
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PORT=8080

# Limpiamos devDependencies
RUN npm prune --production

# Exponer el puerto
EXPOSE 8080

# Comando de arranque
CMD ["node", "dist/main.js"]
