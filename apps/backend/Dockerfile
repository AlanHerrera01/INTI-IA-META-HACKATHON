FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
WORKDIR /app
COPY pyproject.toml ./
RUN --mount=type=secret,id=build_ca,required=false \
    cp /etc/ssl/certs/ca-certificates.crt /tmp/build-ca.pem && \
    if [ -f /run/secrets/build_ca ]; then cat /run/secrets/build_ca >> /tmp/build-ca.pem; fi && \
    sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && \
    printf 'Acquire::https::CaInfo "/tmp/build-ca.pem";\n' > /etc/apt/apt.conf.d/inti-build-ca && \
    PIP_CERT=/tmp/build-ca.pem python -c "import subprocess,tomllib; subprocess.check_call(['pip','install','--no-cache-dir',*tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']])" && \
    NODE_EXTRA_CA_CERTS=/tmp/build-ca.pem playwright install --with-deps chromium && \
    rm /tmp/build-ca.pem /etc/apt/apt.conf.d/inti-build-ca && useradd -m inti && mkdir /app/artifacts && chown -R inti:inti /opt/browsers /app
COPY src ./src
RUN --mount=type=secret,id=build_ca,required=false \
    cp /etc/ssl/certs/ca-certificates.crt /tmp/build-ca.pem && \
    if [ -f /run/secrets/build_ca ]; then cat /run/secrets/build_ca >> /tmp/build-ca.pem; fi && \
    PIP_CERT=/tmp/build-ca.pem pip install --no-cache-dir --no-deps . && rm /tmp/build-ca.pem
COPY alembic.ini ./
COPY migrations ./migrations
USER inti
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn inti.main:app --host 0.0.0.0 --port 8000"]
