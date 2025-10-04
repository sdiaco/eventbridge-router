# HTTP Client

Service HTTP per EventBridge Router con retry automatico, timeout e gestione errori.

Ottimizzato per:
- **Webhook esterni** (Slack, Discord, custom endpoints)
- **API REST** (fetch dati, aggiornamenti stato)
- **Notifiche HTTP** triggered da eventi

## Utilizzo Base

```typescript
import { HttpClient } from '@services/fetch';

// Client per webhook Slack
const slackClient = new HttpClient({
  baseUrl: 'https://hooks.slack.com',
  timeoutMs: 5000,
  maxRetries: 2
});

await slackClient.post('/services/T00/B00/XXX', {
  body: { text: 'Evento ricevuto: ordine #1234' }
});

// Client per API esterne
const apiClient = new HttpClient({
  baseUrl: 'https://api.example.com',
  defaultHeaders: { 'Authorization': 'Bearer token' }
});

const user = await apiClient.get<User>('/users/123');
```

## Configurazione Client

```typescript
interface HttpClientOptions {
  baseUrl?: string;              // URL base per tutte le richieste
  defaultHeaders?: Record<string, string>;  // Header predefiniti
  timeoutMs?: number;            // Timeout default: 10000ms (10s)
  maxRetries?: number;           // Tentativi retry: default 2 (3 tentativi totali)
  userAgent?: string;            // User-Agent custom
  retryOn?: (res: Response | Error) => boolean;  // Logica retry personalizzata
}
```

### Retry Automatico

Di default il client effettua retry per:
- Errori di rete (DNS, timeout, connessione)
- Status code 429 (Too Many Requests)
- Status code 5xx (errori server)

```typescript
const client = new HttpClient({
  maxRetries: 3,
  retryOn: (resOrErr) => {
    if (resOrErr instanceof Error) return true;
    return resOrErr.status === 503; // retry solo su 503
  }
});
```

### Backoff Strategy

Il client usa **exponential backoff con jitter**:
- Tentativo 1: ~200ms
- Tentativo 2: ~400ms
- Tentativo 3: ~800ms
- Cap massimo: 2000ms

Rispetta l'header `Retry-After` (max 30s).

## Opzioni per Richiesta

```typescript
interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;  // Query params
  body?: any;                       // Request body (auto-serialized a JSON)
  timeoutMs?: number;               // Override timeout per questa richiesta
  responseType?: 'json' | 'text';   // Default: auto-detect da content-type
  validateStatus?: (status: number) => boolean;  // Default: 200-299
  signal?: AbortSignal;             // Per cancellare la richiesta
  fireAndForget?: boolean;          // Invia senza attendere risposta (no retry, no error)
}
```

## Esempi

### Query Parameters

```typescript
await client.get('/search', {
  query: { q: 'node.js', limit: 10 }
});
// → GET /search?q=node.js&limit=10
```

### Headers Personalizzati

```typescript
await client.post('/data', {
  headers: { 'X-API-Key': 'secret' },
  body: { value: 123 }
});
```

### Timeout Personalizzato

```typescript
// Richiesta lenta, aumenta timeout
await client.get('/heavy-operation', {
  timeoutMs: 30_000  // 30 secondi
});
```

### Abort Signal

```typescript
const controller = new AbortController();

setTimeout(() => controller.abort(), 5000);

try {
  await client.get('/slow-endpoint', {
    signal: controller.signal
  });
} catch (err) {
  // HttpError: Request aborted/timeout after 5000ms
}
```

### Response Type

```typescript
// Auto-detect (default) - usa content-type header
const data = await client.get('/api/data');  // JSON automatico

// Forza parsing text per webhook custom
const webhookResponse = await client.post('/webhook', {
  body: event,
  responseType: 'text'  // "ok", "accepted", etc.
});
```

### Validazione Status Custom

```typescript
await client.get('/endpoint', {
  validateStatus: (status) => status < 500  // considera 4xx come successo
});
```

### Fire-and-Forget (Asincrono senza Risposta)

```typescript
// Invio notifica senza attendere risposta - utile per webhook/eventi
await client.post('/webhook/notify', {
  body: { event: 'order.created', orderId: 123 },
  fireAndForget: true  // ritorna immediatamente, ignora errori
});

// Logging remoto senza bloccare esecuzione
await client.post('/analytics/track', {
  body: { action: 'page_view', url: '/home' },
  fireAndForget: true
});

// Notifiche multiple in parallelo
await Promise.all([
  client.post('/slack/notify', { body: event, fireAndForget: true }),
  client.post('/discord/notify', { body: event, fireAndForget: true }),
  client.post('/analytics/log', { body: event, fireAndForget: true })
]);
```

## Gestione Errori

```typescript
import { HttpError } from '@/types/fetch';

try {
  await client.get('/not-found');
} catch (err) {
  if (err instanceof HttpError) {
    console.log(err.status);    // 404
    console.log(err.message);   // "HTTP 404 Not Found"
    console.log(err.data);      // Response body
    console.log(err.headers);   // Response headers
  }
}
```

### Errori Comuni

| Status | Descrizione |
|--------|-------------|
| `0` | Network error, timeout, abort |
| `429` | Rate limit (automatic retry) |
| `5xx` | Server error (automatic retry) |
| `4xx` | Client error (no retry) |

## Best Practices per EventBridge Router

### 1. Client dedicati per servizio

```typescript
// services/integrations/slack.ts
export const slackClient = new HttpClient({
  baseUrl: 'https://hooks.slack.com',
  timeoutMs: 5_000,
  maxRetries: 2
});

// services/integrations/api.ts
export const externalApi = new HttpClient({
  baseUrl: process.env.EXTERNAL_API_URL,
  defaultHeaders: { 'Authorization': `Bearer ${process.env.API_TOKEN}` },
  timeoutMs: 10_000
});
```

### 2. Timeout brevi per non bloccare eventi

```typescript
// EventBridge: processa eventi velocemente
const client = new HttpClient({
  timeoutMs: 5_000,   // 5s max per webhook
  maxRetries: 1       // 1 retry (2 tentativi totali)
});
```

### 3. Gestione errori con logging

```typescript
import { HttpError } from '@/types/fetch';

async function notifySlack(event: Event) {
  try {
    await slackClient.post('/services/XXX', {
      body: { text: `Evento: ${event.type}` }
    });
    return { success: true };
  } catch (err) {
    if (err instanceof HttpError) {
      // Log per monitoring
      console.error('Slack webhook failed', {
        status: err.status,
        message: err.message,
        event: event.id
      });

      // Retry futuro se 5xx
      if (err.status >= 500) {
        await sendToDeadLetterQueue(event);
      }
    }
    return { success: false, error: err.message };
  }
}
```

### 4. Rispetta rate limit esterni

```typescript
// Il client rispetta automaticamente Retry-After header
const client = new HttpClient({
  maxRetries: 2,  // importante per API con rate limit (Slack, Discord, etc.)
  retryOn: (res) => {
    if (res instanceof Error) return true;
    // Retry su rate limit e server error
    return res.status === 429 || res.status >= 500;
  }
});
```

### 5. Fire-and-forget per notifiche non critiche

```typescript
// Notifiche webhook che non devono bloccare il flusso eventi
async function processEvent(event: Event) {
  // Processa evento (critico)
  await processOrder(event);

  // Notifiche opzionali - fire-and-forget
  await Promise.all([
    slackClient.post('/webhook', {
      body: { text: `Ordine ${event.id} processato` },
      fireAndForget: true
    }),
    analyticsClient.post('/track', {
      body: { event: 'order.processed', id: event.id },
      fireAndForget: true
    })
  ]);

  // Il flusso continua immediatamente, senza attendere webhook
  return { success: true };
}
```

## Metodi Disponibili

```typescript
client.get<T>(url, options?)
client.post<T>(url, options?)
client.put<T>(url, options?)
client.patch<T>(url, options?)
client.delete<T>(url, options?)
client.request<T>(method, url, options?)
```
