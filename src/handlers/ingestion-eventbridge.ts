import { EventBridgeEvent } from 'aws-lambda';
import { sendMessage } from '@/services/sqs';
import { PluginEvent } from '@/types/plugin';

/**
 * EventBridge Ingestion Handler
 *
 * Riceve eventi da EventBridge (1 evento per invocazione) e li invia a SQS
 */
export const handler = async (event: EventBridgeEvent<string, unknown>): Promise<void> => {
  const queueUrl = process.env.PRIMARY_QUEUE_URL;

  if (!queueUrl) {
    console.error('PRIMARY_QUEUE_URL not configured');
    throw new Error('PRIMARY_QUEUE_URL not configured');
  }

  // Trasforma evento EventBridge in PluginEvent
  const pluginEvent: PluginEvent = {
    id: event.id,
    name: event['detail-type'],
    source: event.source,
    data: event.detail,
    timestamp: new Date(event.time),
    attributes: {
      region: event.region,
      account: event.account,
      resources: event.resources,
    },
  };

  try {
    // Invia a SQS
    await sendMessage({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(pluginEvent),
    });

    console.log(`Successfully queued EventBridge event ${event.id} to SQS`);
  } catch (error) {
    console.error('Failed to queue EventBridge event to SQS:', error);
    throw error; // Re-throw per Lambda retry
  }
};
