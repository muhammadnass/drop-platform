# syntax = docker/dockerfile:1
ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim AS base
LABEL fly_launch_runtime="Node.js/Prisma"
WORKDIR /app
ENV NODE_ENV="production"
ENV HOME="/root"
ENV CHECKPOINT_DISABLE="1"

FROM base AS build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp openssl pkg-config python-is-python3
COPY package.json ./
RUN npm install --include=dev
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM base
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives
COPY --from=build /app /app
EXPOSE 4000
CMD [ "npm", "run", "start" ]
