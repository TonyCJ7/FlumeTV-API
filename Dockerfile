FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build \
  && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=7001

USER node

EXPOSE 7001

CMD ["node", "dist/index.js"]
