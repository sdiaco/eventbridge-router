export interface EventRecord {
  eventId: string;
  timestamp: string;
  eventName: string;
  source: string;
  data: unknown;
  status: 'processed' | 'failed' | 'replayed';
  processedAt?: string;
  retryCount: number;
  attributes?: Record<string, unknown>;
  ttl?: number;
}

export interface StoreEventParameters {
  tableName: string;
  eventId: string;
  timestamp: Date;
  eventName: string;
  source: string;
  data: unknown;
  retryCount?: number;
  attributes?: Record<string, unknown>;
  ttlDays?: number;
}

export interface CheckDuplicateParameters {
  tableName: string;
  eventId: string;
}

export interface QueryEventsParameters {
  tableName: string;
  startTime: Date;
  endTime: Date;
  eventName?: string;
  status?: 'processed' | 'failed' | 'replayed';
  limit?: number;
}

export interface UpdateEventStatusParameters {
  tableName: string;
  eventId: string;
  timestamp: string;
  status: 'processed' | 'failed' | 'replayed';
  retryCount?: number;
}
