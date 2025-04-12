# Usa una imagen oficial de Node.js
FROM node:22-alpine

# Crea el directorio de trabajo
WORKDIR /app

# Copia package.json e instala dependencias
COPY package*.json ./
RUN npm install

# Copia el resto de los archivos
COPY . .

# Compila el código de TypeScript a JavaScript
RUN npm run build

# Expone el puerto
EXPOSE 8080

ENV PORT=8080

# Establece el comando de inicio
CMD ["node", "dist/main.js"]