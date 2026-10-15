# Один контейнер: API + бот + воркер напоминаний + статика фронта
FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --no-audit --no-fund
COPY . .
ARG VITE_APP_LINK=""
ENV VITE_APP_LINK=$VITE_APP_LINK
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && npm start"]
