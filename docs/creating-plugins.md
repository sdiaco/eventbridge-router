# Come Creare un Plugin

Guida pratica per creare plugin custom per EventBridge Router.

## Quick Start

Un plugin è una classe che implementa l'interfaccia `Plugin`:

```typescript
import { PluginBase } from '@/core/plugin-base';
import { PluginMode, PluginEvent, PluginContext } from '@/types/plugin';

export class MyPlugin extends PluginBase {
  name = 'my-plugin';
  mode = PluginMode.async;
  events = ['user.created'];

  async onEvent(event: PluginEvent, context: PluginContext): Promise<void> {
    context.logger.info(`Processing event: ${event.name}`);
    // La tua logica qui
  }
}
```

## Anatomia di un Plugin

### 1. Properties Obbligatorie

#### name
Nome univoco del plugin:
```typescript
name = 'slack-notifier';
```

#### mode
Modalità di esecuzione (`async` o `sync`):
```typescript
mode = PluginMode.async;  // Fire-and-forget
// oppure
mode = PluginMode.sync;   // Attende completamento
```

**Quando usare quale?**
- **async**: Notifiche, logging, analytics (non bloccante)
- **sync**: Validazione, trasformazioni, decisioni critiche (bloccante)

### 2. Properties Opzionali

#### events
Filtra quali eventi gestire:

```typescript
// Array di eventi specifici
events = ['user.created', 'user.updated'];

// Funzione custom per pattern matching
events = (eventName) => eventName.startsWith('order.');

// Ometti per gestire TUTTI gli eventi
```

#### metadata
Informazioni sul plugin:
```typescript
metadata = {
  version: '1.0.0',
  description: 'Invia notifiche Slack',
  owner: 'team-platform',
  avgDurationMs: 150,           // Opzionale: performance hint
  executionStrategy: 'inline'   // Opzionale: 'inline' | 'worker'
};
```

### 3. Lifecycle Hooks

#### init (opzionale)
Chiamato all'avvio, per setup iniziale:
```typescript
async init(context: PluginContext): Promise<void> {
  super.init(context); // IMPORTANTE: chiamare sempre super.init()

  // Validazione configurazione
  if (!context.config.apiKey) {
    throw new Error('API key is required');
  }

  // Setup connessioni
  this.slackClient = new SlackClient(context.config.apiKey);
}
```

#### destroy (opzionale)
Chiamato allo shutdown, per cleanup:
```typescript
async destroy(): Promise<void> {
  // Chiudi connessioni
  await this.slackClient?.disconnect();

  // Rilascia risorse
  this.slackClient = null;
}
```

### 4. Event Hooks

#### onEvent
Chiamato per ogni evento che matcha:
```typescript
async onEvent(event: PluginEvent, context: PluginContext): Promise<void> {
  const { id, name, source, data } = event;

  // La tua logica
  await this.sendNotification({
    title: `Event: ${name}`,
    message: `From ${source}`,
    data: JSON.stringify(data)
  });
}
```

#### onReplay (opzionale)
Chiamato quando un evento viene riprocessato:
```typescript
async onReplay(event: PluginEvent, context: PluginContext): Promise<void> {
  // Stesso comportamento di onEvent
  await this.onEvent(event, context);

  // Oppure logica custom per replay
  if (this.alreadyProcessed(event.id)) {
    context.logger.info('Event already processed, skipping');
    return;
  }

  await this.processEvent(event);
}
```

#### onDLQ (opzionale)
Chiamato per eventi finiti in Dead Letter Queue:
```typescript
async onDLQ(event: PluginEvent, context: PluginContext): Promise<void> {
  // Alert per eventi falliti
  await this.sendAlert({
    severity: 'critical',
    message: `Event ${event.id} failed multiple times`,
    event: event
  });
}
```

#### onError (opzionale)
Chiamato quando un hook fallisce:
```typescript
async onError(error: Error, event: PluginEvent, context: PluginContext): Promise<void> {
  // Logging custom
  context.logger.error('Plugin failed', {
    error: error.message,
    stack: error.stack,
    eventId: event.id
  });

  // Retry logic custom
  // Alert a team
  // etc.
}
```

## Usare PluginBase

`PluginBase` fornisce utility comuni:

### HTTP Requests

```typescript
import { PluginBase } from '@/core/plugin-base';

export class WebhookPlugin extends PluginBase {
  name = 'webhook-sender';
  mode = PluginMode.sync;

  async onEvent(event: PluginEvent, context: PluginContext): Promise<void> {
    // Richiesta HTTP con retry automatico
    const response = await this.request<{ success: boolean }>('POST', 'https://api.example.com/webhook', {
      body: {
        event: event.name,
        data: event.data
      },
      retries: 3,           // Default: 3
      timeoutMs: 5000,      // Default: 10000
      headers: {
        'Authorization': `Bearer ${context.config.apiKey}`
      }
    });

    context.logger.info('Webhook sent', { success: response?.success });
  }
}
```

**Note**:
- `mode: async` → fire-and-forget (no wait)
- `mode: sync` → attende risposta + retry automatico

## Context Utilities

Il `context` fornisce accesso a:

### logger
```typescript
context.logger.info('Processing event', { eventId: event.id });
context.logger.warn('Slow processing detected', { duration: 5000 });
context.logger.error('Failed to send notification', error);
context.logger.debug('Event data', event.data);
```

### config
```typescript
// Configurazione specifica del plugin
const apiKey = context.config.apiKey as string;
const webhookUrl = context.config.webhookUrl as string;
const maxRetries = context.config.maxRetries as number || 3;
```

### http
```typescript
// Client HTTP con retry
const result = await context.http.request('GET', 'https://api.example.com/data', {
  retries: 2,
  timeoutMs: 3000
});
```

### metrics (opzionale)
```typescript
if (context.metrics) {
  context.metrics.increment('webhook.sent');
  context.metrics.gauge('webhook.queue.size', queueSize);
  context.metrics.timing('webhook.latency', duration);
}
```

### emit
```typescript
// Emetti un nuovo evento nel sistema
context.emit({
  name: 'notification.sent',
  source: this.name,
  data: {
    userId: event.data.userId,
    channel: 'slack',
    timestamp: new Date().toISOString()
  }
});
```

## Esempi Completi

### Plugin Async: Slack Notifier

```typescript
import { PluginBase } from '@/core/plugin-base';
import { PluginMode, PluginEvent, PluginContext } from '@/types/plugin';

export class SlackNotifier extends PluginBase {
  name = 'slack-notifier';
  mode = PluginMode.async;  // Fire-and-forget
  events = ['user.created', 'order.placed'];

  metadata = {
    version: '1.0.0',
    description: 'Invia notifiche Slack',
    owner: 'platform-team'
  };

  async onEvent(event: PluginEvent, context: PluginContext): Promise<void> {
    const webhookUrl = context.config.webhookUrl as string;

    await this.request('POST', webhookUrl, {
      body: {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `Event: ${event.name}`
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Source:* ${event.source}` },
              { type: 'mrkdwn', text: `*Time:* ${new Date().toISOString()}` }
            ]
          }
        ]
      },
      timeoutMs: 5000
    });

    context.logger.info('Slack notification sent', { eventId: event.id });
  }
}
```

### Plugin Sync: Event Validator

```typescript
import { PluginBase } from '@/core/plugin-base';
import { PluginMode, PluginEvent, PluginContext } from '@/types/plugin';

export class EventValidator extends PluginBase {
  name = 'event-validator';
  mode = PluginMode.sync;  // Bloccante

  metadata = {
    version: '1.0.0',
    description: 'Valida schema eventi',
    owner: 'platform-team',
    avgDurationMs: 50,
    executionStrategy: 'inline'
  };

  async onEvent(event: PluginEvent, context: PluginContext): Promise<void> {
    // Validazione schema
    if (!event.id) {
      throw new Error('Event ID is required');
    }

    if (!event.data || typeof event.data !== 'object') {
      throw new Error('Event data must be an object');
    }

    // Validazione business logic
    if (event.name === 'order.placed') {
      const order = event.data as { total: number; items: unknown[] };

      if (!order.total || order.total <= 0) {
        throw new Error('Order total must be positive');
      }

      if (!order.items || order.items.length === 0) {
        throw new Error('Order must have at least one item');
      }
    }

    context.logger.debug('Event validated successfully', { eventId: event.id });
  }

  async onError(error: Error, event: PluginEvent, context: PluginContext): Promise<void> {
    // Alert per validazione fallita
    context.logger.error('Validation failed', {
      error: error.message,
      eventId: event.id,
      eventName: event.name
    });

    // Emetti evento di validazione fallita
    context.emit({
      name: 'validation.failed',
      source: this.name,
      data: {
        originalEventId: event.id,
        error: error.message
      }
    });
  }
}
```

### Plugin con Init/Destroy

```typescript
import { PluginBase } from '@/core/plugin-base';
import { PluginMode, PluginEvent, PluginContext } from '@/types/plugin';

export class DatabaseLogger extends PluginBase {
  name = 'database-logger';
  mode = PluginMode.async;

  private dbConnection?: DatabaseClient;

  async init(context: PluginContext): Promise<void> {
    super.init(context);

    // Setup database connection
    this.dbConnection = new DatabaseClient({
      host: context.config.dbHost as string,
      database: context.config.dbName as string
    });

    await this.dbConnection.connect();
    context.logger.info('Database connection established');
  }

  async destroy(): Promise<void> {
    // Cleanup
    if (this.dbConnection) {
      await this.dbConnection.disconnect();
      this.dbConnection = undefined;
      this.context?.logger.info('Database connection closed');
    }
  }

  async onEvent(event: PluginEvent, context: PluginContext): Promise<void> {
    if (!this.dbConnection) {
      throw new Error('Database not connected');
    }

    await this.dbConnection.query(
      'INSERT INTO events (id, name, source, data, created_at) VALUES ($1, $2, $3, $4, $5)',
      [event.id, event.name, event.source, JSON.stringify(event.data), new Date()]
    );

    context.logger.debug('Event logged to database', { eventId: event.id });
  }
}
```

## Configurazione Plugin

Passa configurazione specifica al plugin:

```typescript
const pluginManager = new PluginManager({
  logger: console,
  http: httpClient,
  config: {
    'slack-notifier': {
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      channel: '#alerts',
      username: 'EventBridge Bot'
    },
    'database-logger': {
      dbHost: process.env.DB_HOST,
      dbName: 'events',
      dbUser: process.env.DB_USER,
      dbPassword: process.env.DB_PASSWORD
    }
  }
});
```

## Best Practices

### ✅ DO

- **Idempotenza**: plugin devono poter essere rieseguiti senza effetti collaterali
- **Error handling**: cattura e logga errori, non crashare
- **Timeout**: imposta timeout per operazioni esterne
- **Logging**: logga eventi importanti per debugging
- **Cleanup**: rilascia risorse in `destroy()`
- **Validazione**: valida config in `init()`

### ❌ DON'T

- **Blocking operations**: evita operazioni sincrone lunghe
- **State condiviso**: evita state globale, usa context
- **Assumere ordine**: eventi possono arrivare disordinati
- **Hardcode config**: usa sempre `context.config`
- **Ignorare errori**: logga sempre e gestisci gracefully

## Testing

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MyPlugin } from './my-plugin';

describe('MyPlugin', () => {
  it('should process event', async () => {
    const plugin = new MyPlugin();

    const context = {
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      },
      config: {
        apiKey: 'test-key'
      },
      http: {
        request: vi.fn().mockResolvedValue({ success: true })
      },
      emit: vi.fn(),
      metrics: undefined
    };

    const event = {
      id: '123',
      name: 'test.event',
      source: 'test',
      data: { foo: 'bar' }
    };

    await plugin.init(context);
    await plugin.onEvent(event, context);

    expect(context.logger.info).toHaveBeenCalled();
    expect(context.http.request).toHaveBeenCalledWith('POST', expect.any(String), expect.any(Object));
  });
});
```

## Prossimi Passi

1. Crea il tuo plugin in `plugins/my-plugin/index.ts`
2. Registralo nel PluginManager
3. Configura parametri in `config`
4. Testa localmente
5. Deploy 🚀
