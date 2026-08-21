# Build the static site, then serve it with nginx.
#
# The build stage needs git: "last updated by" on every page is read from git
# history at build time. Keep .git in the build context (see .dockerignore) and
# make sure CI checks out the full history — a shallow clone has one commit and
# blanks out most authors. Without git the build still succeeds; pages just
# fall back to the file date with no author.

# Verified: builds clean, 76MB image, deep links and git attribution both work
# in the running container. `docker compose up --build` serves it on :8080.

FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache git

# Dependencies first: this layer is cached until package-lock.json changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS serve
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/feastdocs/browser /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --spider -q http://localhost/ || exit 1
