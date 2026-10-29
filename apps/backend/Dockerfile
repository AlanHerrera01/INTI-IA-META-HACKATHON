FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
WORKDIR /app
COPY pyproject.toml ./
RUN python -c "import subprocess,tomllib; subprocess.check_call(['pip','install','--no-cache-dir',*tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']])" && playwright install --with-deps chromium && useradd -m inti && mkdir /app/artifacts && chown -R inti:inti /opt/browsers /app
COPY src ./src
RUN pip install --no-cache-dir --no-deps .
COPY alembic.ini ./
COPY migrations ./migrations
USER inti
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn inti.main:app --host 0.0.0.0 --port 8000"]
