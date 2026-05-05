FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends cron && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY sync.py .
COPY .env .

RUN echo "0 14 * * * cd /app && python3 sync.py >> /proc/1/fd/1 2>&1" > /etc/cron.d/renpho-sync \
    && chmod 0644 /etc/cron.d/renpho-sync \
    && crontab /etc/cron.d/renpho-sync

CMD python3 sync.py && cron -f
