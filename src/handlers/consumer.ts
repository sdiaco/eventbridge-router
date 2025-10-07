import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { PluginManager } from '@/core/plugin-manager';
import { EventRouter } from '@/core/event-router';
import { Logger, PluginEvent } from '@/types/plugin';
import { HttpClient } from '@/services/fetch';
import { createLogger } from '@/core/logger';
import plugins from '@plugins/config';

/**
 * Logger instance
 */
const logger: Logger = createLogger({
  prefix: 'eventbridge-router'
});

/**
 * Plugin configuration
 */
const pluginConfig: Record<string, Record<string, unknown>> = {};

/**
 * HTTP Client instance
 */
const httpClient = new HttpClient();

/**
 * Initialize PluginManager and EventRouter
 */
const pluginManager = new PluginManager({
  logger,
  http: httpClient,
  config: pluginConfig,
});

// Register plugins
pluginManager.registerAll(plugins);

const eventRouter = new EventRouter(
  pluginManager,
  {
    eventsTableName: process.env.EVENTS_TABLE || '',
    dlqUrl: process.env.DLQ_URL,
    batchSize: 50,
    ttlDays: 30,
  },
  logger
);

/**
 * Lambda initialization
 */
let initialized = false;

async function initialize(): Promise<void> {
  if (initialized) return;

  logger.info('Initializing PluginManager...');
  await pluginManager.init();
  initialized = true;
  logger.info('PluginManager initialized successfully');
}

/**
 * SQS Consumer
 * Processa eventi da SQS, esegue plugin e ritorna failed items per retry parziale
 */
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  await initialize();

  logger.info(`Received ${event.Records.length} messages from SQS`);

  // Parse eventi da SQS
  const events: PluginEvent[] = [];
  const messageIdToEvent = new Map<string, PluginEvent>();

  for (const record of event.Records) {
    try {
      const pluginEvent: PluginEvent = JSON.parse(record.body);
      events.push(pluginEvent);
      messageIdToEvent.set(record.messageId, pluginEvent);
    } catch (error) {
      logger.error(`Failed to parse message ${record.messageId}:`, error);
      // Invalid messages sono skipped (no retry)
    }
  }

  if (events.length === 0) {
    logger.warn('No valid events to process');
    return { batchItemFailures: [] };
  }

  try {
    // Processa batch
    await eventRouter.processBatch(events);

    // Success: no failed items
    return { batchItemFailures: [] };
  } catch (error) {
    logger.error('Critical error processing batch:', error);

    // Failure: mark all messages as failed for retry
    const batchItemFailures: SQSBatchItemFailure[] = event.Records.map((record) => ({
      itemIdentifier: record.messageId,
    }));

    return { batchItemFailures };
  }
};
