FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=build_ca,required=false \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci
COPY . .
RUN npm run build && chown -R node:node /app
USER node
ENV API_PROXY_TARGET=http://backend:8000
EXPOSE 5173
CMD ["npm", "run", "dev"]
