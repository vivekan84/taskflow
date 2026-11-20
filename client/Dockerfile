FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci
COPY client ./client
COPY shared ./shared
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "client"]
