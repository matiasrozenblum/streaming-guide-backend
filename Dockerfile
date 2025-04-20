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

# Variables de entorno
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production
ENV PORT=8080

# Directorio de trabajo
WORKDIR /app

# Copiar dependencias y paquetes
COPY package*.json ./

# Instalar solo las dependencias de producción
RUN npm install --only=production

# Copiar el resto del código
COPY . .

# Build del proyecto
RUN npm run build

# Exponer el puerto
EXPOSE 8080

# Comando de arranque
CMD ["node", "dist/main.js"]
