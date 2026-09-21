# FAULT API server.
#
# Two stages so the image that runs in production never contains the
# TypeScript sources or the build cache, while still carrying the Prisma CLI:
# `prisma migrate deploy` runs at container start (see CMD), and the CLI is a
# devDependency. Pruning dev deps would save ~60MB and break every deploy that
# ships a migration, so they are kept deliberately.
#
# Build context is server/ (render.yaml sets dockerContext accordingly). The
# legal documents do not need the repo root: tools/legal/sync.mjs compiles
# them into src/lib/legalText.ts, which is part of this context.

FROM node:22-slim AS build
WORKDIR /app

# The Prisma schema engine is a native binary that links against OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
# prisma.config.ts resolves DATABASE_URL eagerly, and generate needs none of
# it — a placeholder keeps generate from failing on a variable it never uses.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

COPY src ./src
RUN npm run build


FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/dist ./dist

# Never run as root in the container. The node image ships this user.
USER node

# Render (and most hosts) inject PORT; env.ts reads it. 4000 is the local default.
EXPOSE 4000

# Migrations first, then the server. If a migration fails the container exits
# non-zero and the host keeps the previous release serving — which is the
# behaviour you want, rather than a new server running against an old schema.
# tini reaps zombies and forwards SIGTERM so in-flight requests can finish.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
