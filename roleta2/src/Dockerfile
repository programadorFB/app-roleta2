FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Remover arquivos desnecessarios do build
RUN rm -f /usr/share/nginx/html/*.map 2>/dev/null; \
    rm -f /usr/share/nginx/html/**/*.map 2>/dev/null; \
    true

EXPOSE 81

CMD ["nginx", "-g", "daemon off;"]
