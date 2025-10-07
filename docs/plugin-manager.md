# PluginManager

**PluginManager** è il coordinatore dei plugin: li registra, li inizializza e li esegue quando arrivano eventi.

## Cosa Fa

```
Plugin Registration → Initialization → Event Execution
```

1. **Registra** i plugin disponibili
2. **Inizializza** tutti i plugin al boot
3. **Filtra** quali plugin devono gestire un evento
4. **Esegue** i plugin in parallelo
5. **Gestisce** errori e retry

## Ciclo di Vita dei Plugin

### 1. Registration
```typescript
const pluginManager = new PluginManager({ logger, http, config });

// Registra singolo plugin
pluginManager.register(slackNotifier);

// Oppure registra multipli
pluginManager.registerAll([slackNotifier, emailSender, validator]);
```

### 2. Initialization
```typescript
await pluginManager.init();
// Chiama il metodo init() di ogni plugin
// Esegue setup, connessioni, validazioni
```

### 3. Event Execution
```typescript
const event = {
  id: '123',
  name: 'order.created',
  source: 'api',
  data: { orderId: 456 }
};

await pluginManager.triggerEvent(event);
// Esegue onEvent() di tutti i plugin che gestiscono 'order.created'
```

### 4. Cleanup
```typescript
await pluginManager.destroy();
// Chiama il metodo destroy() di ogni plugin
// Chiude connessioni, rilascia risorse
```

## Event Hooks

I plugin possono implementare diversi hook per gestire eventi:

### onEvent
Chiamato per eventi normali.
```typescript
onEvent: async (event, context) => {
  // Logica principale del plugin
  await sendSlackMessage(event.data);
}
```

### onReplay
Chiamato quando un evento viene riprocessato.
```typescript
onReplay: async (event, context) => {
  // Gestione replay (es. skip se già processato)
  if (alreadyProcessed(event.id)) return;
  await sendSlackMessage(event.data);
}
```

### onDLQ
Chiamato per eventi finiti in DLQ.
```typescript
onDLQ: async (event, context) => {
  // Alert per eventi falliti
  await sendAlertToOpsTeam(event);
}
```

### onError
Chiamato quando un hook fallisce.
```typescript
onError: async (error, event, context) => {
  // Logging custom, recovery, alert
  context.logger.error('Plugin failed', { error, eventId: event.id });
}
```

## Filtering Eventi

I plugin possono filtrare quali eventi gestire:

### Array di eventi
```typescript
events: ['order.created', 'order.updated']
// Gestisce solo questi 2 eventi
```

### Funzione custom
```typescript
events: (eventName) => eventName.startsWith('order.')
// Gestisce tutti gli eventi che iniziano con 'order.'
```

### Nessun filtro
```typescript
// events non specificato
// Gestisce TUTTI gli eventi
```

## Context

Ogni plugin riceve un **context** con utility:

### logger
Logging strutturato:
```typescript
context.logger.info('Processing event', { eventId: event.id });
context.logger.error('Failed to send notification', error);
```

### config
Configurazione specifica del plugin:
```typescript
const apiKey = context.config.apiKey;
const webhookUrl = context.config.webhookUrl;
```

### http
Client HTTP con retry:
```typescript
const result = await context.http.request('POST', url, {
  body: { message: 'Hello' },
  retries: 3
});
```

### emit
Emetti un nuovo evento:
```typescript
context.emit({
  name: 'notification.sent',
  source: 'slack-notifier',
  data: { userId: 123 }
});
```

## Gestione Errori

**Esecuzione parallela**: tutti i plugin vengono eseguiti in parallelo con `Promise.allSettled`.

**Plugin failure**: se un plugin fallisce:
1. ✅ Errore loggato
2. ✅ Metriche incrementate
3. ✅ Hook `onError` chiamato (se presente)
4. ✅ Altri plugin continuano l'esecuzione

**Comportamento**:
- Plugin A fallisce → Plugin B e C continuano
- Nessun rollback
- Failure isolato per plugin

## Configurazione

```typescript
const pluginManager = new PluginManager({
  logger: consoleLogger,           // Required
  http: httpClient,                // Optional
  metrics: metricsCollector,       // Optional
  config: {                        // Optional
    'slack-notifier': {
      webhookUrl: 'https://...',
      channel: '#alerts'
    },
    'email-sender': {
      smtpHost: 'smtp.gmail.com',
      from: 'noreply@example.com'
    }
  }
});
```

## Esempio Completo

```typescript
import { PluginManager } from '@/core/plugin-manager';
import { SlackNotifier } from '@/plugins/slack-notifier';
import { EmailSender } from '@/plugins/email-sender';

// Setup
const pluginManager = new PluginManager({
  logger: console,
  http: httpClient,
  config: {
    'slack-notifier': { webhookUrl: process.env.SLACK_WEBHOOK },
    'email-sender': { smtpHost: process.env.SMTP_HOST }
  }
});

// Registration
pluginManager.registerAll([
  new SlackNotifier(),
  new EmailSender()
]);

// Initialization
await pluginManager.init();

// Event processing
const event = {
  id: '123',
  name: 'order.created',
  source: 'api',
  data: { orderId: 456, total: 99.99 }
};

await pluginManager.triggerEvent(event);

// Cleanup (on shutdown)
process.on('SIGTERM', async () => {
  await pluginManager.destroy();
});
```

## Logging

```
INFO  Plugin registered: slack-notifier
INFO  Plugin registered: email-sender
INFO  Initializing 2 plugins...
INFO  Plugin initialized: slack-notifier
INFO  Plugin initialized: email-sender
INFO  All plugins initialized in 145ms
ERROR Plugin "slack-notifier" failed on event: Network timeout
INFO  Destroying plugins...
INFO  Plugin destroyed: slack-notifier
INFO  Plugin destroyed: email-sender
INFO  All plugins destroyed
```

## Best Practices

✅ **Idempotenza**: plugin devono poter essere rieseguiti senza side-effects
✅ **Timeout**: operazioni lunghe devono avere timeout
✅ **Error handling**: gestire errori gracefully (non crashare)
✅ **Logging**: loggare azioni importanti per debugging
✅ **Cleanup**: rilasciare risorse in `destroy()`

## API Reference

### Methods

- `register(plugin)` - Registra un plugin
- `registerAll(plugins[])` - Registra multipli plugin
- `init()` - Inizializza tutti i plugin
- `destroy()` - Cleanup tutti i plugin
- `triggerEvent(event, pluginNames?)` - Esegue hook onEvent
- `triggerReplay(event, pluginNames?)` - Esegue hook onReplay
- `triggerDLQ(event, pluginNames?)` - Esegue hook onDLQ
- `getPlugin(name)` - Ottieni plugin per nome
- `listPlugins()` - Lista nomi plugin registrati
