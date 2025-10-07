# EventBridge Router

Sistema serverless AWS per il processing asincrono di eventi attraverso un'architettura a plugin modulari.

[![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-orange)](https://aws.amazon.com/lambda/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Serverless](https://img.shields.io/badge/Serverless-3.x-red)](https://www.serverless.com/)

## Panoramica

EventBridge Router riceve eventi da multiple sorgenti (API Gateway, EventBridge), li mette in coda SQS e li processa attraverso plugin personalizzabili. Sistema ottimizzato per costi bassi (~$10-15/mese per 1M eventi) e latenza ridotta.

```
┌─────────────┐
│ EventBridge │──┐
└─────────────┘  │    ┌─────┐    ┌──────────┐    ┌───────────────┐
                 ├───→│ SQS │───→│ Consumer │───→│ PluginManager │
┌─────────────┐  │    └─────┘    │  Lambda  │    └───────────────┘
│ API Gateway │──┘               └──────────┘             │
└─────────────┘                                           ▼
                                                  ┌────────────────┐
                                                  │ Plugin         │
                                                  │ (async/sync)   │
                                                  └────────────────┘
```

## Features

- ✅ **Multi-source ingestion**: API Gateway HTTP + EventBridge
- ✅ **Plugin modulari**: Architettura estensibile con async/sync modes
- ✅ **Deduplication**: Automatica via DynamoDB (30 giorni TTL)
- ✅ **Partial Batch Failure**: Retry granulare per eventi falliti
- ✅ **Low latency**: Max 5 secondi dal receive al processing
- ✅ **Cost-optimized**: Standard SQS + On-Demand DynamoDB
- ✅ **Type-safe**: Full TypeScript con strict mode
- ✅ **Testabile**: Vitest + Docker locale

## Quick Start

### Installazione

```bash
# Clone repository
git clone https://github.com/sdiaco/eventbridge-router.git
cd eventbridge-router

# Installa dipendenze
yarn install

# Build
yarn build
```

### Deploy AWS

```bash
# Deploy ambiente dev
yarn deploy:dev

# Deploy produzione
yarn deploy:prod
```

### Test Locale

```bash
# Avvia container Docker
docker-compose run --rm lambda-test sh

# Dentro al container
yarn build
yarn invoke:consumer --path sqs-event-sample.json
```

[Guida completa test locale →](./README-LOCAL.md)

## Invio Eventi

### HTTP API

```bash
curl -X POST https://your-api.execute-api.eu-west-1.amazonaws.com/dev/events \
  -H "Content-Type: application/json" \
  -d '{
    "name": "user.created",
    "source": "api",
    "data": {
      "userId": "123",
      "email": "user@example.com"
    }
  }'
```

### EventBridge

**AWS CLI:**
```bash
aws events put-events --entries '[
  {
    "Source": "custom.events",
    "DetailType": "user.created",
    "Detail": "{\"userId\":\"123\",\"email\":\"user@example.com\"}"
  }
]'
```

**SDK:**
```typescript
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

const client = new EventBridgeClient({});
await client.send(new PutEventsCommand({
  Entries: [{
    Source: "custom.events",
    DetailType: "user.created",
    Detail: JSON.stringify({ userId: "123" })
  }]
}));
```

## Creare un Plugin

```typescript
import { PluginBase } from '@/core/plugin-base';
import { PluginMode, PluginEvent, PluginContext } from '@/types/plugin';

export class MyPlugin extends PluginBase {
  name = 'my-plugin';
  mode = PluginMode.async;
  events = ['user.created'];

  metadata = {
    version: '1.0.0',
    description: 'My custom plugin',
    owner: 'team-name'
  };

  async onEvent(event: PluginEvent, context: PluginContext): Promise<void> {
    context.logger.info(`Processing: ${event.name}`);

    // HTTP request (con retry automatico se sync mode)
    await this.request('POST', 'https://api.example.com/webhook', {
      body: event.data,
      timeoutMs: 5000
    });
  }
}
```

### Registra Plugin

```typescript
// plugins/config.ts
import { MyPlugin } from './my-plugin';

const plugins: Plugin[] = [
  new MyPlugin(),
];

export default plugins;
```

[Guida completa creazione plugin →](./docs/creating-plugins.md)

## Documentazione

- [Architettura Sistema](./docs/architecture.md) - Overview completa componenti e flussi
- [Creazione Plugin](./docs/creating-plugins.md) - Guida step-by-step
- [Plugin Manager](./docs/plugin-manager.md) - API e lifecycle hooks
- [Event Router](./docs/event-router.md) - Deduplication e batch processing
- [HTTP Client](./docs/http-client.md) - Request con retry automatico

## Struttura Progetto

```
eventbridge-router/
├── src/
│   ├── handlers/           # Lambda handlers
│   │   ├── consumer.ts         # SQS consumer
│   │   ├── ingestion-http.ts   # HTTP ingestion
│   │   └── ingestion-eventbridge.ts
│   ├── core/               # Core logic
│   │   ├── plugin-manager.ts   # Plugin orchestration
│   │   ├── event-router.ts     # Deduplication & routing
│   │   ├── plugin-base.ts      # Base class per plugin
│   │   └── logger.ts
│   ├── services/           # AWS services
│   │   ├── sqs.ts
│   │   ├── dynamodb.ts
│   │   └── fetch.ts
│   └── types/              # TypeScript types
├── plugins/                # Plugin personalizzati
│   ├── config.ts
│   └── slack-notifier/
├── tests/                  # Unit tests
├── docs/                   # Documentazione
├── serverless.yml          # Infra config
└── docker-compose.yml      # Test locale
```

## Plugin Modes

### Async Mode (Fire-and-Forget)
```typescript
mode = PluginMode.async;
```
- Non bloccante
- Nessun retry automatico
- Ideale per: notifiche, logging, analytics
- Fallisce silenziosamente

### Sync Mode (Wait for Completion)
```typescript
mode = PluginMode.sync;
```
- Bloccante
- Retry automatico su errori
- Ideale per: validazioni, trasformazioni critiche
- Errori fermano il processing

## Testing

```bash
# Run tutti i test
yarn test

# Test con coverage
yarn test:coverage

# Test UI
yarn test:ui
```

## Configurazione

### Environment Variables

```bash
# .env.local (development)
STAGE=dev
LOG_LEVEL=debug
SKIP_DEDUPLICATION=true

# Plugin config
PLUGIN_SLACK_WEBHOOK=https://hooks.slack.com/...
```

### Serverless Variables

```yaml
# serverless.yml
custom:
  sqsBatchSize:
    dev: 10
    prod: 50
  sqsBatchWindow:
    dev: 5    # secondi
    prod: 5
  logLevel:
    dev: info
    prod: info
```

## Costi Stimati

| Volume | Costo/mese | Note |
|--------|-----------|------|
| 1K | ~$0.10 | Free tier |
| 10K | ~$0.10 | Free tier |
| 100K | ~$1 | - |
| 1M | ~$9 | - |
| 10M | ~$93 | Possibili ottimizzazioni |
| 100M | ~$450 | Con Redis + Provisioned DDB |

[Analisi costi dettagliata →](./docs/cost-analysis.md)

## Monitoring

### CloudWatch Alarms (solo Prod)

- **DLQ Messages > 0**: Alert quando eventi finiscono in DLQ
- **Lambda Errors > 5**: Alert su errori consumer Lambda

### Logs

```bash
# Tail logs consumer Lambda
yarn logs

# Logs specifici
aws logs tail /aws/lambda/eventbridge-router-consumer-dev --follow
```

### Metrics

- **Success/Failure rate** per plugin
- **Processing time** batch
- **Deduplication hit rate**

## Roadmap

- [ ] Worker Lambda separata per plugin sync
- [ ] Metrics Dashboard custom
- [ ] ElastiCache al posto di DynamoDB per deduplicazione

## Limitazioni

### AWS Limits
- SQS batch: max 10 messaggi per `SendMessageBatch`
- DynamoDB batch: max 100 items per `BatchGetItem`
- Lambda timeout: max 15 minuti (configurato 5 min)
- SQS payload: max 256 KB per messaggio

### Performance
- Cold start: ~1-2s prima invocazione Lambda
- Deduplication window: 7 giorni (TTL DynamoDB)
- Max latency: 5 secondi (SQS batch window)

## Contributing

1. Fork repository
2. Crea feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Apri Pull Request

## License

MIT

## Support

- Issues: [GitHub Issues](https://github.com/sdiaco/eventbridge-router/issues)
- Docs: [./docs](./docs/)
- Email: diacosimone00@gmail.com
