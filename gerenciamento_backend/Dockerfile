# ============================================
# Dockerfile - gerenciamento_backend (Flask + gunicorn)
# Migrations rodam automaticamente via entrypoint.sh
# ============================================
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    FLASK_APP=wsgi.py

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY . .

# Normaliza fim de linha (CRLF->LF) caso o checkout no Windows reintroduza \r,
# senão o shebang vira "bash\r" e o container entra em loop de restart (exit 127).
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 5004

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "wsgi:app", \
     "--bind", "0.0.0.0:5004", \
     "--workers", "2", \
     "--threads", "4", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
