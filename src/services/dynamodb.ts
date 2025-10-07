import dynamoDBService from '../lib/dynamodb';
import type {
  StoreEventParameters,
  CheckDuplicateParameters,
  QueryEventsParameters,
  UpdateEventStatusParameters,
  EventRecord,
  BatchCheckDuplicatesParameters,
} from '../types/dynamodb';

const {
  docClient,
  commands: { PutCommand, GetCommand, QueryCommand, UpdateCommand, BatchGetCommand },
} = dynamoDBService;

const checkDuplicate = async (params: CheckDuplicateParameters): Promise<boolean> => {
  const command = new GetCommand({
    TableName: params.tableName,
    Key: {
      eventId: params.eventId,
    },
  });

  const result = await docClient.send(command);
  return !!result.Item;
};

/**
 * Verifica in batch la presenza di eventi duplicati usando BatchGetItem
 * Gestisce automaticamente il limite AWS di 100 items per batch
 * @param params - parametri contenenti tableName e array di eventIds
 * @returns Set di eventIds che esistono (duplicati)
 */
const batchCheckDuplicates = async (params: BatchCheckDuplicatesParameters): Promise<Set<string>> => {
  const { tableName, eventIds } = params;
  const duplicates = new Set<string>();

  // Se array vuoto, ritorna subito
  if (eventIds.length === 0) {
    return duplicates;
  }

  // AWS BatchGetItem ha un limite di 100 items per richiesta
  const BATCH_SIZE = 100;
  const batches: string[][] = [];

  for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
    batches.push(eventIds.slice(i, i + BATCH_SIZE));
  }

  // Processa ogni batch
  for (const batch of batches) {
    try {
      const command = new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: batch.map((eventId) => ({ eventId })),
          },
        },
      });

      const result = await docClient.send(command);

      // Estrai gli eventIds trovati
      if (result.Responses && result.Responses[tableName]) {
        result.Responses[tableName].forEach((item) => {
          if (item.eventId) {
            duplicates.add(item.eventId as string);
          }
        });
      }

      // Gestisci UnprocessedKeys (retry automatico)
      if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0) {
        const unprocessedIds =
          result.UnprocessedKeys[tableName]?.Keys?.map((key) => key.eventId as string) || [];

        // Fallback: verifica individualmente gli unprocessed
        for (const eventId of unprocessedIds) {
          const isDuplicate = await checkDuplicate({ tableName, eventId });
          if (isDuplicate) {
            duplicates.add(eventId);
          }
        }
      }
    } catch (error) {
      // In caso di errore su un batch, fallback su check individuali
      console.error('BatchGetItem error, falling back to individual checks:', error);
      for (const eventId of batch) {
        try {
          const isDuplicate = await checkDuplicate({ tableName, eventId });
          if (isDuplicate) {
            duplicates.add(eventId);
          }
        } catch (checkError) {
          console.error(`Error checking duplicate for eventId ${eventId}:`, checkError);
          // In caso di errore anche sul singolo check, skippa questo eventId
        }
      }
    }
  }

  return duplicates;
};

const storeEvent = async (params: StoreEventParameters): Promise<void> => {
  const ttl = params.ttlDays ? Math.floor(Date.now() / 1000) + params.ttlDays * 24 * 60 * 60 : undefined;

  const command = new PutCommand({
    TableName: params.tableName,
    Item: {
      eventId: params.eventId,
      timestamp: params.timestamp.toISOString(),
      eventName: params.eventName,
      source: params.source,
      data: params.data,
      status: 'processed',
      processedAt: new Date().toISOString(),
      retryCount: params.retryCount || 0,
      attributes: params.attributes,
      ...(ttl && { ttl }),
    },
  });

  await docClient.send(command);
};

const queryEvents = async (params: QueryEventsParameters): Promise<EventRecord[]> => {
  const command = new QueryCommand({
    TableName: params.tableName,
    KeyConditionExpression: '#timestamp BETWEEN :start AND :end',
    ExpressionAttributeNames: {
      '#timestamp': 'timestamp',
    },
    ExpressionAttributeValues: {
      ':start': params.startTime.toISOString(),
      ':end': params.endTime.toISOString(),
    },
    Limit: params.limit,
  });

  const result = await docClient.send(command);
  return (result.Items as EventRecord[]) || [];
};

const updateEventStatus = async (params: UpdateEventStatusParameters): Promise<void> => {
  const command = new UpdateCommand({
    TableName: params.tableName,
    Key: {
      eventId: params.eventId,
      timestamp: params.timestamp,
    },
    UpdateExpression: 'SET #status = :status, #retryCount = :retryCount, processedAt = :processedAt',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#retryCount': 'retryCount',
    },
    ExpressionAttributeValues: {
      ':status': params.status,
      ':retryCount': params.retryCount || 0,
      ':processedAt': new Date().toISOString(),
    },
  });

  await docClient.send(command);
};

export { checkDuplicate, batchCheckDuplicates, storeEvent, queryEvents, updateEventStatus };
