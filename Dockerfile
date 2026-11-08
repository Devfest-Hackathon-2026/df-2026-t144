# One Cloud Run service: the Expo web export + the API (routes, Gemini).
# Build context is the repository root: `gcloud run deploy --source .`

FROM node:24-alpine AS web
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
# The web build calls the API on the same origin, so no URL is baked in.
ENV EXPO_PUBLIC_API_URL=same-origin
RUN pnpm exec expo export --platform web --output-dir dist

FROM node:24-alpine
WORKDIR /app
COPY server/*.mjs ./server/
COPY src/data/catalog.json ./src/data/catalog.json
COPY --from=web /app/dist ./web
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 WEB_DIST_DIR=/app/web
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
