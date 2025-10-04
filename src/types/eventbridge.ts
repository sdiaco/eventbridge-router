import type { PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';

export interface PublishEventParameters {
  eventBusName?: string;
  source: string;
  detailType: string;
  detail: Record<string, unknown>;
  resources?: string[];
}

export interface PublishEventsBatchParameters {
  eventBusName?: string;
  entries: Array<{
    source: string;
    detailType: string;
    detail: Record<string, unknown>;
    resources?: string[];
  }>;
}

export type EventBridgeEntry = PutEventsRequestEntry;
