FROM node:24-alpine
WORKDIR /app
COPY server ./server
COPY src/data/catalog.json ./src/data/catalog.json
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
