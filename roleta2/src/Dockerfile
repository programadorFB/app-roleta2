FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_URL
ARG VITE_AFFILIATE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AFFILIATE_URL=$VITE_AFFILIATE_URL

RUN npm run build

FROM nginx:alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

# Remover arquivos desnecessarios do build
RUN rm -f /usr/share/nginx/html/*.map 2>/dev/null; \
    rm -f /usr/share/nginx/html/**/*.map 2>/dev/null; \
    true

CMD ["nginx", "-g", "daemon off;"]
