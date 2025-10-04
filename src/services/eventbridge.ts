import eventBridgeService from '../lib/eventbridge';
import type { PublishEventParameters, PublishEventsBatchParameters } from '../types/eventbridge';

const {
  client,
  commands: { PutEventsCommand },
} = eventBridgeService;

const publishEvent = async (params: PublishEventParameters): Promise<void> => {
  const command = new PutEventsCommand({
    Entries: [
      {
        EventBusName: params.eventBusName,
        Source: params.source,
        DetailType: params.detailType,
        Detail: JSON.stringify(params.detail),
        Resources: params.resources,
      },
    ],
  });

  const result = await client.send(command);

  if (result.FailedEntryCount && result.FailedEntryCount > 0) {
    throw new Error(`Failed to publish event: ${result.Entries?.[0]?.ErrorMessage}`);
  }
};

const publishEventsBatch = async (params: PublishEventsBatchParameters): Promise<void> => {
  const command = new PutEventsCommand({
    Entries: params.entries.map((entry) => ({
      EventBusName: params.eventBusName,
      Source: entry.source,
      DetailType: entry.detailType,
      Detail: JSON.stringify(entry.detail),
      Resources: entry.resources,
    })),
  });

  const result = await client.send(command);

  if (result.FailedEntryCount && result.FailedEntryCount > 0) {
    const errors = result.Entries?.filter((e) => e.ErrorCode).map((e) => e.ErrorMessage);
    throw new Error(`Failed to publish ${result.FailedEntryCount} events: ${errors?.join(', ')}`);
  }
};

export { publishEvent, publishEventsBatch };
