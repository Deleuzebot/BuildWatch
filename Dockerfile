FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
# Public build-time values only. Server secrets are injected at runtime.
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_AUTH0_DOMAIN
ARG EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID
ARG EXPO_PUBLIC_AUTH0_AUDIENCE
ARG EXPO_PUBLIC_AUTH0_EMAIL_CONNECTION=Username-Password-Authentication
ARG EXPO_PUBLIC_REVENUECAT_WEB_KEY
RUN pnpm export:web
RUN mkdir -p /data && chown node:node /data
ENV HOST=0.0.0.0 PORT=8765 DATA_FILE=/data/projects.json NODE_ENV=production
USER node
EXPOSE 8765
CMD ["pnpm", "serve"]
