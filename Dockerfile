# Imagen opcional: build de la SPA + Nginx con cabeceras anti-caché para el Service Worker.
# Uso: docker build -t printmanager-spa . && docker run -p 8080:80 printmanager-spa

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
