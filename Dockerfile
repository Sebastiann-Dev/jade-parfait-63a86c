# Utiliza la imagen oficial de Node.js ligera basada en Alpine Linux
FROM node:20-alpine

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de definición de dependencias
COPY package*.json ./

# Instala todas las dependencias
RUN npm install

# Copia todo el código fuente del proyecto al contenedor
COPY . .

# Expone el puerto 3000 en el que corre Vite
EXPOSE 3000

# Arranca el servidor de desarrollo exponiendo el host para acceder desde fuera del contenedor
CMD ["npm", "run", "dev", "--", "--host"]
