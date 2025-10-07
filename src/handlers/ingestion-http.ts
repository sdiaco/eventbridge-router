import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { sendMessageBatch } from '@/services/sqs';
import { PluginEvent } from '@/types/plugin';

/**
 * HTTP Ingestion Handler
 *
 * Riceve 1 evento via API Gateway e lo invia a SQS (fire-and-forget)
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const queueUrl = process.env.PRIMARY_QUEUE_URL;

  if (!queueUrl) {
    console.error('PRIMARY_QUEUE_URL not configured');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal configuration error' }),
    };
  }

  // Parse body
  let pluginEvent: PluginEvent;
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    pluginEvent = JSON.parse(event.body);
  } catch (error) {
    console.error('Invalid JSON body:', error);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  // Validazione base
  if (!pluginEvent.name || !pluginEvent.source || pluginEvent.data === undefined) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Invalid event format. Required: name, source, data',
      }),
    };
  }

  try {
    // Invia singolo evento a SQS
    await sendMessageBatch({
      QueueUrl: queueUrl,
      Entries: [
        {
          Id: '0',
          MessageBody: JSON.stringify(pluginEvent),
        },
      ],
    });

    console.log(`Successfully queued event to SQS`);

    return {
      statusCode: 202,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Event queued successfully',
      }),
    };
  } catch (error) {
    console.error('Failed to queue event to SQS:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to queue event' }),
    };
  }
};
