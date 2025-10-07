# Architettura EventBridge Router

## Panoramica

EventBridge Router è un sistema serverless AWS per il processing asincrono di eventi attraverso un'architettura a plugin modulari. Il sistema riceve eventi da diverse sorgenti, li mette in coda, li processa e li distribuisce a plugin personalizzabili.

## Flusso Dati

```
┌─────────────────┐
│   EventBridge   │──┐
└─────────────────┘  │
                     │    ┌──────────┐    ┌──────────┐    ┌────────────────┐
                     ├───→│   SQS    │───→│ Consumer │───→│ PluginManager  │
                     │    │  Queue   │    │ Lambda   │    └────────────────┘
┌─────────────────┐  │    └──────────┘    └──────────┘             │
│  API Gateway    │──┘                                              │
└─────────────────┘                                                 ▼
                                                          ┌──────────────────┐
                                                          │ Plugin Execution │
                                                          │   (Async/Sync)   │
                                                          └──────────────────┘
                                                                    │
                                                                    ▼
                                                          ┌──────────────────┐
                                                          │    DynamoDB      │
                                                          │  Deduplication   │
                                                          └──────────────────┘
```

## Componenti Principali

### 1. Ingestion Layer (Entrypoint)

**Responsabilità:** Ricevere eventi dalle sorgenti esterne e inserirli in coda SQS.

#### Ingestion HTTP (`ingestion-http.ts`)
- **Trigger:** API Gateway endpoint POST `/events`
- **Input:** Singolo evento JSON nel body della richiesta
- **Output:** Messaggio SQS
- **Comportamento:** Fire-and-forget, ritorna 202 Accepted immediatamente
- **Caso d'uso:** Integrazioni API dirette, webhook, client esterni

#### Ingestion EventBridge (`ingestion-eventbridge.ts`)
- **Trigger:** Eventi AWS EventBridge con pattern matching
- **Input:** Evento EventBridge nativo
- **Output:** Messaggio SQS con formato normalizzato
- **Comportamento:** Trasforma evento EventBridge in formato PluginEvent
- **Caso d'uso:** Integrazioni con servizi AWS, eventi infrastrutturali

### 2. Queue Layer (SQS)

**Responsabilità:** Buffer asincrono e disaccoppiamento tra ingestion e processing.

#### Primary Queue
- **Tipo:** Standard Queue (più economica di FIFO)
- **Visibilità Timeout:** 5 minuti (configurabile per stage)
- **Batching:** 10-50 messaggi per invocazione Lambda
- **Retry:** Max 3 tentativi prima di Dead Letter Queue
- **Vantaggi:**
  - Disaccoppiamento produttori/consumatori
  - Gestione automatica retry
  - Scalabilità elastica
  - Costi ridotti (~$0.40 per milione di richieste)

#### Dead Letter Queue (DLQ)
- **Scopo:** Raccolta eventi falliti dopo 3 tentativi
- **Retention:** 14 giorni
- **Alert:** CloudWatch Alarm quando ci sono messaggi
- **Hook:** Trigger plugin `onDLQ()` per notifiche/recovery

### 3. Processing Layer (Consumer)

**Responsabilità:** Processare batch di eventi dalla coda, eseguire deduplication, orchestrare plugin.

#### Consumer Lambda (`consumer.ts`)
- **Trigger:** SQS batch (10-50 eventi)
- **Timeout:** 5 minuti
- **Memory:** 1024 MB
- **Flusso:**
  1. Parse messaggi SQS → PluginEvent
  2. Batch deduplication (DynamoDB)
  3. Group eventi per plugin (async/sync)
  4. Esecuzione parallela plugin
  5. Storage eventi processati (DynamoDB)
  6. Invio eventi falliti a DLQ

**Partial Batch Failure:**
- Eventi falliti ritornano a SQS per retry
- Eventi riusciti vengono cancellati dalla coda
- Nessun rollback: failure isolato per evento

### 4. Plugin System

**Responsabilità:** Logica business personalizzabile per il processing degli eventi.

#### PluginManager
- **Registrazione:** Carica plugin all'avvio Lambda
- **Filtering:** Esegue solo plugin che matchano l'evento (per nome o pattern)
- **Execution Modes:**
  - **Async:** Fire-and-forget, non bloccante
  - **Sync:** Attende completamento, può bloccare l'evento
- **Context:** Fornisce utilities ai plugin (logger, http client, config, emit)

#### Plugin Lifecycle
1. **init()** - Setup iniziale (connessioni, validazioni)
2. **onEvent()** - Processing evento normale
3. **onReplay()** - Processing evento riprocessato
4. **onDLQ()** - Notifica evento fallito in DLQ
5. **onError()** - Gestione errori custom
6. **destroy()** - Cleanup risorse

#### Plugin Esistenti
- **SlackNotifier:** Invia notifiche Slack per eventi specifici

### 5. Storage Layer (DynamoDB)

**Responsabilità:** Deduplication eventi e storage audit trail.

#### Events Table
- **Billing:** On-Demand (pay-per-request, ~$1.25 per milione di write)
- **Key Schema:** eventId (HASH)
- **TTL:** 30 giorni (cleanup automatico)
- **Funzioni:**
  - **Deduplication:** Verifica se evento già processato
  - **Batch Check:** BatchGetItem per multiple verifiche simultanee
  - **Audit Trail:** Storico eventi processati

## Pattern e Best Practices

### Deduplication Strategy
- **Batch Check:** Single DynamoDB BatchGetItem per verificare 100 eventi
- **Fallback:** Controlli individuali se batch fallisce
- **Performance:** ~50-70% riduzione latency vs controlli seriali

### Error Handling
- **Plugin Failure:** Isolato, non blocca altri plugin
- **Batch Failure:** Partial retry solo eventi falliti
- **DLQ:** Automatic retry (3x) poi DLQ con alert

### Scalability
- **Horizontal:** Lambda auto-scale, SQS elastico
- **Throughput:** ~1000 eventi/sec in configurazione base
- **Cost Optimization:** Standard queue, DynamoDB on-demand

### Monitoring
- **CloudWatch Logs:** Tutti gli handler e plugin
- **Metrics:** Success/failure rate per plugin
- **Alarms:**
  - DLQ messages > 0
  - Lambda errors > 5 in 5 minuti

## Configurazione per Stage

### Development
- **SQS Batch Size:** 10 eventi
- **Lambda Memory:** 1024 MB
- **Log Level:** Debug
- **DynamoDB:** On-Demand

### Production
- **SQS Batch Size:** 50 eventi
- **Lambda Memory:** 1024 MB
- **Log Level:** Info
- **DynamoDB:** On-Demand con backup

## Costi Stimati (1M eventi/mese)

### Scenario Base
- **Lambda:** ~$5 (100ms avg, 1GB)
- **SQS:** ~$0.80 (2M requests: 1M ingestion + 1M consumer)
- **DynamoDB:** ~$2.50 (2M writes: dedup + storage)
- **API Gateway:** ~$3.50 (se usato)
- **EventBridge:** ~$1.00 (se usato)

**Totale:** ~$10-15/mese per 1 milione di eventi

## Estensibilità

### Aggiungere Nuovo Plugin
1. Creare classe che estende `PluginBase`
2. Implementare `onEvent()` o altri hook
3. Registrare in `plugins/config.ts`
4. Deploy automatico con serverless

### Aggiungere Nuova Sorgente
1. Creare handler ingestion (es: `ingestion-sns.ts`)
2. Configurare trigger in `serverless.yml`
3. Trasformare evento nativo in `PluginEvent`
4. Inviare a SQS Primary Queue

### Customizzazioni Comuni
- **Filtri Custom:** Funzioni di matching eventi per plugin
- **Retry Logic:** Configurabile per plugin (timeout, retries)
- **Validazioni:** Pre-processing schema validation
- **Trasformazioni:** Data enrichment, normalization

## Sicurezza

### IAM Permissions
- **Ingestion:** Solo SendMessage su SQS
- **Consumer:** ReceiveMessage, DeleteMessage, GetQueueAttributes
- **DynamoDB:** PutItem, GetItem, BatchGetItem
- **DLQ:** SendMessage per eventi falliti

### Encryption
- **At Rest:** DynamoDB SSE enabled
- **In Transit:** HTTPS per API Gateway, TLS per SQS

### Input Validation
- **API Gateway:** Schema validation (opzionale)
- **Consumer:** JSON parsing con error handling
- **Plugin:** Validazione business logic custom

## Disaster Recovery

### Backup Strategy
- **DynamoDB:** TTL automatico dopo 30 giorni
- **SQS:** Message retention 14 giorni
- **DLQ:** Retention 14 giorni per recovery manuale

### Recovery Procedures
1. **Plugin Failure:** Auto-retry via SQS (3x)
2. **DLQ Events:** Manual replay via API o script
3. **Data Loss:** Non critico, deduplication basata su TTL

## Limitazioni Conosciute

### AWS Limits
- **SQS Batch:** Max 10 messaggi per SendMessageBatch
- **DynamoDB Batch:** Max 100 items per BatchGetItem
- **Lambda Timeout:** Max 15 minuti (configurato 5 min)
- **Payload Size:** Max 256 KB per messaggio SQS

### Performance
- **Cold Start:** ~1-2s prima invocazione Lambda
- **Deduplication Window:** 30 giorni (TTL DynamoDB)
- **Concurrent Executions:** Unlimitato (può aumentare costi)

## Roadmap Future

### Funzionalità Pianificate
- **Worker Lambda:** Sync plugin execution in Lambda separata
- **Circuit Breaker:** Protezione plugin lenti/fallimenti
- **Replay System:** UI per riprocessare eventi DLQ
- **Metrics Dashboard:** CloudWatch dashboard custom
- **Plugin Marketplace:** Repository plugin condivisi

### Ottimizzazioni
- **DynamoDB Stream:** Trigger plugin da eventi DynamoDB
- **SNS Fanout:** Alternative ingestion pattern
- **Step Functions:** Workflow complessi multi-step
- **X-Ray Tracing:** Distributed tracing end-to-end
