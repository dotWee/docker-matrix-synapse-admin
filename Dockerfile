# Builder
FROM oven/bun:debian AS builder
LABEL org.opencontainers.image.url=https://github.com/Awesome-Technologies/synapse-admin org.opencontainers.image.source=https://github.com/Awesome-Technologies/synapse-admin
# Base path for synapse admin
ARG BASE_PATH=./

WORKDIR /src

COPY package.json bun.lock ./

# Install packages
RUN bun install --frozen-lockfile

COPY . /src
RUN bun run build --base=$BASE_PATH

# App
FROM nginx:stable-alpine

COPY --from=builder /src/dist /app

RUN rm -rf /usr/share/nginx/html \
 && ln -s /app /usr/share/nginx/html
