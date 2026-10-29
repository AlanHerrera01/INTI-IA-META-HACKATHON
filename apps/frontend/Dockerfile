FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && chown -R node:node /app
USER node
ENV API_PROXY_TARGET=http://backend:8000
EXPOSE 5173
CMD ["npm", "run", "dev"]
