# Usa una imagen base oficial de Node.js
FROM node:18-alpine

# Crea el directorio de la aplicación
WORKDIR /app

# Copia los archivos del proyecto
COPY package*.json ./

# Instala las dependencias
RUN npm install

# Copia el resto de los archivos
COPY . .

# Construye la aplicación
RUN npm run build

# Expone el puerto
EXPOSE 3000

# Comando para ejecutar la app
CMD ["node", "dist/main.js"]