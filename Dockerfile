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

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar todas las dependencias (PROD + DEV)
RUN npm install

# Copiar el resto del proyecto
COPY . .

# Compilar el proyecto Nest.js
RUN npm run build

# Eliminar devDependencies para la imagen final
RUN npm prune --production

# Exponer el puerto
EXPOSE 8080

# Comando de arranque
CMD ["node", "dist/main.js"]
