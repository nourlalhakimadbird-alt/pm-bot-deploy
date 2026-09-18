FROM node:26-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

CMD ["npx", "openclaw", "gateway", "run"]
