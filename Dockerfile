# ZsírKréta konténerek: egy Dockerfile, két kép
#   diák:  docker build -t zsirkreta .                       (alapértelmezett)
#   tanár: docker build --target tanar -t zsirkreta-tanar .
# Indítás: docker compose up -d (diák), docker compose up -d tanar (tanár), lásd docker-compose.yml

# ---------- közös alap ----------
FROM python:3.14-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Europe/Budapest

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt "gunicorn>=26"

# nem root felhasználóval fut; az adatbázis és a titkosítókulcs a /data kötetben marad meg
RUN useradd --system --uid 1000 --home-dir /app app \
    && mkdir -p /data && chown app:app /data
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os,urllib.request,sys; sys.exit(urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4).status != 200)"

# ---------- tanári verzió ----------
FROM base AS tanar
ENV KT_DATA=/data PORT=3100
COPY tanar/kreta_tanar/ kreta_tanar/
COPY tanar/public/ public/
USER app
EXPOSE 3100
# Egy worker kell: a linkes belépés és a teszt iskola zárai a memóriában vannak. A párhuzamosságot a szálak adják.
CMD ["gunicorn", "--bind", "0.0.0.0:3100", "--workers", "1", "--threads", "8", "--timeout", "120", \
     "--access-logfile", "-", "--no-control-socket", "kreta_tanar:create_app()"]

# ---------- diák verzió (alapértelmezett, ezért az utolsó) ----------
FROM base AS diak
ENV KP_DATA=/data KP_ENV=production PORT=3000
COPY zsirkreta/ zsirkreta/
COPY public/ public/
USER app
EXPOSE 3000
# Egy worker kell: a linkes belépés függő állapota a memóriában van. A párhuzamosságot a szálak adják.
CMD ["gunicorn", "--bind", "0.0.0.0:3000", "--workers", "1", "--threads", "8", "--timeout", "60", \
     "--access-logfile", "-", "--no-control-socket", "zsirkreta:create_app()"]
