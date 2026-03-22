# STAGE 1: Build
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

# Ponemos los ARG justo antes del build para asegurar frescura
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Estos ENV son obligatorios para que Vite los vea
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

RUN npm run build

# STAGE 2: Nginx
FROM nginx:stable-alpine

# Configuración Nginx + MIME Types para PWA
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Aseguramos que el manifest se sirva bien
    location ~* \.(webmanifest|manifest)$ {
        add_header Content-Type application/manifest+json;
        add_header Cache-Control "no-cache";
    }

    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }
}
EOF

COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]