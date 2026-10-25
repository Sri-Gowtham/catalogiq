# Build the web app, then run the API with the built files baked in. One container, one port.
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    CATALOGIQ_ENV=production \
    CATALOGIQ_DB=/data/catalogiq.db \
    CATALOGIQ_OUTPUT=/data/output
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY sample_data/ sample_data/
COPY --from=web /web/dist frontend/dist
RUN useradd --create-home app && mkdir /data && chown app /data
# Litestream copies the database to object storage (used only when LITESTREAM_BUCKET is set)
RUN python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb', '/tmp/litestream.deb')" \
    && dpkg -i /tmp/litestream.deb && rm /tmp/litestream.deb
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
VOLUME /data
WORKDIR /app/backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
# starts as root only to fix the disk ownership, then runs the server as the "app" user
ENTRYPOINT ["docker-entrypoint.sh"]
