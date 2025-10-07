# EventRouter

**EventRouter** è il cuore del sistema: riceve batch di eventi dalla coda SQS Primary e li elabora in modo efficiente e parallelo.

## Cosa Fa

```
Eventi SQS → EventRouter → Plugin → DynamoDB + DLQ
```

1. **Riceve** un batch di eventi (fino a 50)
2. **Deduplica** eventi già processati (check DynamoDB)
3. **Classifica** i plugin per tipo (async/sync)
4. **Esegue** i plugin in parallelo
5. **Salva** eventi processati con successo
6. **Invia** eventi falliti alla DLQ

## Tipi di Plugin

### Async Plugins
Plugin che non richiedono una risposta immediata:
- Invio notifiche Slack
- Invio email
- Logging eventi

**Comportamento**: eseguiti in parallelo, errori tracciati ma non bloccanti.

### Sync Inline Plugins
Plugin veloci che devono completare prima di procedere:
- Validazione dati
- Aggiornamenti stato
- Trasformazioni rapide

**Comportamento**: eseguiti in parallelo, errori causano invio a DLQ.

### Sync Worker Plugins ⚠️
Plugin lenti che richiedono Lambda dedicato:
- Elaborazioni pesanti
- API esterne lente

**Comportamento**: **non ancora implementato**, viene loggato un warning.

## Flusso di Processing

```
1. Batch deduplication
   ↓
2. Classifica plugin per evento
   ↓
3. Esegue async plugins (parallelo)
   ↓
4. Esegue sync inline plugins (parallelo)
   ↓
5. Identifica eventi falliti
   ↓
6. Salva eventi success → DynamoDB
   ↓
7. Invia eventi failed → DLQ
```

## Gestione Errori

**Eventi falliti** (async o sync):
- ✅ Loggati con dettaglio errore
- ✅ Inviati a DLQ con error stack
- ✅ Non bloccano altri eventi nel batch

**Errori critici** (DynamoDB, SQS):
- ❌ Batch fallisce completamente
- ❌ Lambda retry automatico

## Deduplicazione

Ogni evento con `id` viene verificato in DynamoDB prima del processing:
- **Duplicato trovato** → skip evento
- **Nuovo evento** → processa e salva

**Batch optimization**: singola chiamata DynamoDB BatchGetItem per tutti gli eventi.

## Configurazione

```typescript
{
  eventsTableName: string;  // Tabella DynamoDB per dedup
  dlqUrl?: string;          // URL coda DLQ
  batchSize?: number;       // Default: 50
  ttlDays?: number;         // TTL eventi in DynamoDB (default: 30)
}
```

## Performance

**Ottimizzazioni implementate**:
- ✅ Batch deduplication (1 chiamata vs N chiamate)
- ✅ Esecuzione parallela plugin (async + sync)
- ✅ Batch storage DynamoDB
- ✅ Promise.allSettled per resilienza

**Risultato**: ~50-70% riduzione latency rispetto a processing sequenziale.

## Esempio d'Uso

```typescript
import { EventRouter } from '@/core/event-router';
import { PluginManager } from '@/core/plugin-manager';

// Setup
const pluginManager = new PluginManager({ logger, http, config });
pluginManager.registerAll([slackPlugin, validationPlugin]);
await pluginManager.init();

// EventRouter
const router = new EventRouter(
  pluginManager,
  {
    eventsTableName: 'Events',
    dlqUrl: 'https://sqs.region.amazonaws.com/account/dlq',
    batchSize: 50,
    ttlDays: 30,
  },
  logger
);

// Processing batch
const events = [
  { id: '1', name: 'order.created', source: 'api', data: { orderId: 123 } },
  { id: '2', name: 'user.signup', source: 'web', data: { userId: 456 } },
];

await router.processBatch(events);
```

## Logging

```
INFO  Processing batch of 10 events
INFO  After deduplication: 8 unique events
INFO  Executed 15 async plugin invocations across 8 events
INFO  Stored 7 events in DynamoDB
INFO  Sent 1 failed events to DLQ
INFO  Batch completed: 7 succeeded, 1 failed in 234ms
```

## Limitazioni Attuali

⚠️ **Sync Worker Plugins**: non implementati, viene solo loggato warning
⚠️ **Secondary Queue**: non utilizzata (integrazione futura per worker)

## Prossimi Step

1. Implementare invocazione Lambda worker per sync worker plugins
2. Aggiungere metriche CloudWatch
3. Implementare replay eventi da DynamoDB
