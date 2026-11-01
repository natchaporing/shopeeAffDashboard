# Video Studio: web app + API + Remotion renderer in one container.
FROM node:22-bookworm-slim

# Runtime libraries for Chrome Headless Shell (Remotion's renderer), plus fonts:
# emoji typed into hooks/titles and a general fallback. Thai uses the bundled Kanit.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
		libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
		libpango-1.0-0 libcairo2 libcups2 \
		fonts-noto-color-emoji fonts-dejavu-core \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Build the web app and download Chrome Headless Shell into the image so the
# first render doesn't have to.
RUN npm run build && npx remotion browser ensure

ENV NODE_ENV=production \
	DATA_DIR=/data \
	PORT=3000
EXPOSE 3000

CMD ["node", "--import", "tsx", "src/server/index.ts"]
