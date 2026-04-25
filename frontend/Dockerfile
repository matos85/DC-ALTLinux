FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* /app/
RUN npm install

COPY . /app

ENV API_PROXY_TARGET=http://backend:8000

# Время сборки в бандл (Настройки → блок «Сборка интерфейса»). Без пересборки образа UI не обновится.
ARG APP_BUILD
RUN export NEXT_PUBLIC_APP_BUILD="${APP_BUILD:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" \
  && npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
