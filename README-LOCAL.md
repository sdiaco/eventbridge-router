# Test Locale con Docker

## Quick Start

```bash
# Entra nel container e invoca la lambda
docker-compose run --rm lambda-test sh

# Dentro al container:
yarn invoke:consumer --path sqs-event-sample.json
```

`.env.local` viene caricato automaticamente da `serverless-dotenv-plugin`.

## File

- **`sqs-event-sample.json`** - Evento SQS fake con 2 messaggi
- **`.env.local`** - Environment variables (dedup disabilitata)
