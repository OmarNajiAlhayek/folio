FROM python:3.12-slim AS build

WORKDIR /app
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install --no-cache-dir .

FROM python:3.12-slim

RUN useradd --create-home --shell /bin/bash folio
WORKDIR /app
USER folio

COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY pyproject.toml README.md ./
COPY app ./app

ENV APP_ENV=production
ENV PORT=5245
ENV GRPC_PORT=5246
EXPOSE 5245 5246

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5245/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5245"]
