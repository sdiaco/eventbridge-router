import dynamoDBService from '../lib/dynamodb';
import type {
  StoreEventParameters,
  CheckDuplicateParameters,
  QueryEventsParameters,
  UpdateEventStatusParameters,
  EventRecord,
} from '../types/dynamodb';

const {
  docClient,
  commands: { PutCommand, GetCommand, QueryCommand, UpdateCommand },
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

export { checkDuplicate, storeEvent, queryEvents, updateEventStatus };
