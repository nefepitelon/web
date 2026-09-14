FROM python:3.12.14-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    QUANT_REQUEST_FILE=/request/request.json \
    QUANT_PROJECT_DIR=/project \
    QUANT_STATE_DIR=/state

RUN pip install --no-cache-dir --only-binary=:all: nautilus_trader==1.231.0 \
    && useradd --uid 10001 --create-home quant

WORKDIR /opt/quant-nautilus
COPY driver.py /opt/quant-nautilus/driver.py
USER quant
STOPSIGNAL SIGTERM
ENTRYPOINT ["python", "/opt/quant-nautilus/driver.py"]
