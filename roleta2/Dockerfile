FROM node:20-alpine

RUN npm install -g pm2

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

CMD ["pm2-runtime", "ecosystem.config.cjs"]
