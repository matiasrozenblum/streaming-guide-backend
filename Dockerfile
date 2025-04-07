# Usa una imagen oficial de Node.js
FROM node:22-alpine

# Crea el directorio de trabajo
WORKDIR /app

# Copia package.json e instala dependencias
COPY package*.json ./
RUN npm install

# Copia el resto de los archivos del proyecto
COPY . .

# Compila el código de TypeScript a JavaScript
RUN npm run build

# Expone el puerto 3000 (Nest.js por defecto)
EXPOSE 3000

# Establece el comando de inicio (ajustado al nuevo path)
CMD ["node", "dist/src/main.js"]
