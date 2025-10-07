# Analisi Costi EventBridge Router

Breakdown costi per volumi crescenti di eventi mensili.

## Componenti di Costo

| Servizio | Pricing | Note |
|----------|---------|------|
| Lambda | $0.20 per 1M richieste + $0.0000166667 per GB-secondo | ARM64, 512MB |
| SQS Standard | $0.40 per 1M richieste | Long polling abilitato |
| DynamoDB | $1.25 per 1M write request units | On-Demand mode |
| API Gateway HTTP | $1.00 per 1M richieste | Primo 1M gratis nel free tier |
| EventBridge | $1.00 per 1M eventi custom | Opzionale |

## Scenario: 1K eventi/mese

**Volume**: 1,000 eventi
**Uso**: Testing, sviluppo

| Servizio | Calcolo | Costo |
|----------|---------|-------|
| Lambda | 3K invocations × 100ms @ 512MB | $0.00 (free tier) |
| SQS | 2K requests (in+out) | $0.00 (free tier) |
| DynamoDB | 2K writes (dedup+storage) | $0.00 (free tier) |
| API Gateway | 1K requests | $0.00 (free tier) |
| **TOTALE** | | **~$0.10** |

**Note**: Completamente coperto dal free tier AWS.

---

## Scenario: 10K eventi/mese

**Volume**: 10,000 eventi
**Uso**: Piccola startup, ambiente staging

| Servizio | Calcolo | Costo |
|----------|---------|-------|
| Lambda | 30K invocations × 100ms @ 512MB | $0.05 |
| SQS | 20K requests | $0.01 |
| DynamoDB | 20K writes | $0.03 |
| API Gateway | 10K requests | $0.01 |
| **TOTALE** | | **~$0.10** |

**Note**: Ancora marginale, praticamente free tier.

---

## Scenario: 100K eventi/mese

**Volume**: 100,000 eventi
**Uso**: Startup in crescita, produzione light

| Servizio | Calcolo | Costo |
|----------|---------|-------|
| Lambda | 300K invocations × 100ms @ 512MB | $0.50 |
| SQS | 200K requests | $0.08 |
| DynamoDB | 200K writes | $0.25 |
| API Gateway | 100K requests | $0.10 |
| **TOTALE** | | **~$1.00** |

**Ottimizzazioni**: Nessuna necessaria.

---

## Scenario: 1M eventi/mese

**Volume**: 1,000,000 eventi
**Uso**: Produzione medio-piccola

| Servizio | Calcolo | Costo |
|----------|---------|-------|
| Lambda | 2M invocations × 100ms @ 512MB | $5.00 |
| SQS | 2M requests (1M in + 1M consumer read) | $0.80 |
| DynamoDB | 2M writes (dedup check + storage) | $2.50 |
| API Gateway | 1M requests | $1.00 |
| EventBridge | 1M eventi (se usato) | $1.00 |
| **TOTALE (HTTP)** | | **~$9.30** |
| **TOTALE (EventBridge)** | | **~$9.30** |

**Note**:
- Batch size 50 ottimizza Lambda invocations
- DynamoDB inizia a pesare (~27% del costo)

---

## Scenario: 10M eventi/mese

**Volume**: 10,000,000 eventi
**Uso**: Produzione medio-grande

| Servizio | Calcolo | Costo |
|----------|---------|-------|
| Lambda | 20M invocations × 100ms @ 512MB | $50.00 |
| SQS | 20M requests | $8.00 |
| DynamoDB | 20M writes | $25.00 |
| API Gateway | 10M requests | $10.00 |
| **TOTALE** | | **~$93.00** |

---

## Scenario: 100M eventi/mese

**Volume**: 100,000,000 eventi
**Uso**: Produzione enterprise

| Servizio | Calcolo | Costo |
|----------|---------|-------|
| Lambda | 200M invocations × 100ms @ 512MB | $500.00 |
| SQS | 200M requests | $80.00 |
| DynamoDB | 200M writes | $250.00 |
| API Gateway | 100M requests | $100.00 |
| **TOTALE** | | **~$930.00** |

**Possibili ottimizzazioni**:

### 1. DynamoDB Provisioned Capacity
```
On-Demand:     $250/mese
Provisioned:   $100/mese (50 WCU reserved)
Risparmio:     ~60%
```

### 2. ElastiCache Redis per Deduplication
```
Cache t4g.micro:  $12/mese
Risparmio DDB:    -$150/mese (60% hit rate)
ROI:              +$138/mese
```

### 3. Lambda Optimization
```
- Batch size 100 (invece di 50)
- Invocations dimezzate: 100M → 50M
- Risparmio: $250/mese
```

### 4. EventBridge invece API Gateway
```
API Gateway:   $100/mese
EventBridge:   $100/mese
Costo uguale ma più scalabile
```

**Con ottimizzazioni**: ~$450/mese (-52%)

---

## Breakdown per Componente

### Lambda (batch size 50, 100ms avg)

| Volume | Invocations | Costo |
|--------|-------------|-------|
| 1K | 3K | $0.00 |
| 10K | 30K | $0.05 |
| 100K | 300K | $0.50 |
| 1M | 2M | $5.00 |
| 10M | 20M | $50.00 |
| 100M | 200M | $500.00 |

**Ottimizzazione**: Batch size 100 dimezza gli invocations.

### DynamoDB (On-Demand)

| Volume | Write RUs | Costo |
|--------|-----------|-------|
| 1K | 2K | $0.00 |
| 10K | 20K | $0.03 |
| 100K | 200K | $0.25 |
| 1M | 2M | $2.50 |
| 10M | 20M | $25.00 |
| 100M | 200M | $250.00 |

**Ottimizzazione**: Provisioned a 50 WCU = ~$100/mese fisso (conveniente sopra 10M).

### SQS Standard

| Volume | Requests | Costo |
|--------|----------|-------|
| 1K | 2K | $0.00 |
| 10K | 20K | $0.01 |
| 100K | 200K | $0.08 |
| 1M | 2M | $0.80 |
| 10M | 20M | $8.00 |
| 100M | 200M | $80.00 |

**Note**: Costo fisso ~8% del totale, non ottimizzabile.

---

## ROI Ottimizzazioni

### ElastiCache Redis (>10M eventi)

```
Costo ElastiCache t4g.micro: $12/mese
Risparmio DynamoDB (60% hit): $15/mese @ 10M eventi
                              $150/mese @ 100M eventi

Break-even: ~8M eventi/mese
```

### DynamoDB Provisioned (>10M eventi)

```
On-Demand @ 100M:     $250/mese
Provisioned 50 WCU:   $100/mese
Risparmio:            $150/mese

Break-even: ~8M eventi/mese
```

### Lambda Batch Size Optimization

```
Batch 50 → 100:
- Dimezza invocations
- Risparmio 50% su costi Lambda
- Nessun costo aggiuntivo

Trade-off: +latency (max 10s invece di 5s)
```

---

## Stima Rapida

**Formula semplificata**:

```
Costo ≈ (Eventi × $0.000009) + $0.10

Dove:
- Eventi < 1M:    ~$0.01 per 1K eventi
- Eventi 1M-10M:  ~$0.009 per 1K eventi
- Eventi >10M:    ~$0.004 per 1K eventi (con ottimizzazioni)
```

**Esempi**:
- 50K eventi/mese: ~$0.50
- 500K eventi/mese: ~$4.50
- 5M eventi/mese: ~$45
- 50M eventi/mese: ~$200 (ottimizzato)

---

## Confronto con Alternative

### AWS Step Functions
```
EventBridge Router: $9/1M eventi
Step Functions:     $25/1M transitions
```
**Vantaggio**: 64% più economico

### SQS → Lambda Direct (senza dedup)
```
Con dedup (DynamoDB):  $9/1M
Senza dedup:           $6/1M
```
**Trade-off**: -$3/mese ma rischio duplicati

### SNS Fanout
```
EventBridge Router:    $9/1M
SNS + Multiple SQS:    $15/1M
```
**Vantaggio**: 40% più economico, più flessibile

---

## Conclusione

EventBridge Router è cost-effective fino a 10M eventi/mese senza modifiche.

Oltre quella soglia, con ottimizzazioni (Redis + Provisioned DDB), scala fino a 100M+ eventi/mese mantenendo costi sotto controllo (~$450/mese).

Il sistema risulta più economico rispetto a Step Functions (~64%) o soluzioni SaaS come Zapier ($600/mese per 10M eventi).
