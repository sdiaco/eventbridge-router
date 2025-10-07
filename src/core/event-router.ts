import { PluginManager } from '@/core/plugin-manager';
import { batchCheckDuplicates, storeEvent } from '@/services/dynamodb';
import { sendMessageBatch } from '@/services/sqs';
import { PluginEvent, PluginMode, Logger } from '@/types/plugin';
import { EventRouterConfig } from '@/types/event-router';

export class EventRouter {
  private readonly config: EventRouterConfig & { batchSize: number; ttlDays: number };
  private readonly pluginManager: PluginManager;
  private readonly logger: Logger;

  constructor(pluginManager: PluginManager, config: EventRouterConfig, logger: Logger) {
    this.pluginManager = pluginManager;
    this.logger = logger;

    // Default values
    this.config = {
      eventsTableName: config.eventsTableName,
      dlqUrl: config.dlqUrl,
      batchSize: config.batchSize || 50,
      ttlDays: config.ttlDays || 30,
    };
  }

  /**
   * Processa un batch di eventi
   *
   * Flusso:
   * 1. Batch deduplication (DynamoDB BatchGetItem)
   * 2. Group events by plugin
   * 3. Execute async plugins
   * 4. Execute sync inline plugins
   * 5. Batch storage successful events
   * 6. Extract failed events and send to DLQ
   *
   * Nota: sync worker plugins non sono ancora implementati
   */
  async processBatch(events: PluginEvent[]): Promise<void> {
    if (events.length === 0) {
      this.logger.info('Empty batch, skipping processing');
      return;
    }

    this.logger.info(`Processing batch of ${events.length} events`);
    const startTime = Date.now();

    try {
      // 1. Batch deduplication
      const uniqueEvents = await this.batchDeduplication(events);
      this.logger.info(`After deduplication: ${uniqueEvents.length} unique events`);

      if (uniqueEvents.length === 0) {
        this.logger.info('All events are duplicates, skipping processing');
        return;
      }

      // 2. Group events by plugins
      const pluginGroups = this.groupPluginsByMode(uniqueEvents);

      // 3. Execute async plugins
      const asyncResults = await this.executeAsyncPlugins(pluginGroups.async);

      // 4. Execute sync plugins
      const syncResults = await this.executeSyncPlugins(pluginGroups.sync);

      // 5. Extract failed events
      const failedEvents = this.extractFailedEvents(uniqueEvents, asyncResults, syncResults);
      const successfulEvents = uniqueEvents.filter((e) => !failedEvents.includes(e));

      // 6. Batch storage successful events
      await this.batchStoreEvents(successfulEvents);

      // 7. Send failed events to DLQ
      if (failedEvents.length > 0) {
        const allErrors = new Map([...asyncResults.errors, ...syncResults.errors]);
        await this.sendToDLQ(failedEvents, allErrors);
      }

      const duration = Date.now() - startTime;
      this.logger.info(
        `Batch completed: ${successfulEvents.length} succeeded, ${failedEvents.length} failed in ${duration}ms`
      );
    } catch (error) {
      this.logger.error('Critical error in batch processing:', error);
      throw error; // Re-throw for Lambda retry
    }
  }

  /**
   * Batch deduplication
   */
  private async batchDeduplication(events: PluginEvent[]): Promise<PluginEvent[]> {
    // Filtra eventi con ID valido
    const eventsWithId = events.filter((e) => !!e.id);
    const eventsWithoutId = events.filter((e) => !e.id);

    if (eventsWithId.length === 0) {
      return eventsWithoutId; // Nessun evento da deduplicare
    }

    try {
      // Batch check duplicates
      const eventIds = eventsWithId.map((e) => e.id!);
      const duplicateIds = await batchCheckDuplicates({
        tableName: this.config.eventsTableName,
        eventIds,
      });

      // Filtra eventi unici
      const uniqueEventsWithId = eventsWithId.filter((e) => !duplicateIds.has(e.id!));

      if (duplicateIds.size > 0) {
        this.logger.warn(`Found ${duplicateIds.size} duplicate events, skipping them`);
      }

      return [...uniqueEventsWithId, ...eventsWithoutId];
    } catch (error) {
      this.logger.error('Batch deduplication failed, falling back to processing all events:', error);
      // Fallback: processa tutti gli eventi in caso di errore critico
      return events;
    }
  }

  /**
   * Raggruppa eventi per plugin e mode (async vs sync)
   */
  private groupPluginsByMode(events: PluginEvent[]): {
    async: Array<{ event: PluginEvent; plugins: string[] }>;
    sync: {
      inline: Array<{ event: PluginEvent; plugins: string[] }>;
      worker: Array<{ event: PluginEvent; plugins: string[] }>;
    };
  } {
    const asyncGroups: Array<{ event: PluginEvent; plugins: string[] }> = [];
    const syncInlineGroups: Array<{ event: PluginEvent; plugins: string[] }> = [];
    const syncWorkerGroups: Array<{ event: PluginEvent; plugins: string[] }> = [];

    for (const event of events) {
      const asyncPlugins: string[] = [];
      const syncInlinePlugins: string[] = [];
      const syncWorkerPlugins: string[] = [];

      const allPluginNames = this.pluginManager.listPlugins();

      for (const name of allPluginNames) {
        const plugin = this.pluginManager.getPlugin(name);
        if (!plugin) continue;

        // Verifica se plugin gestisce questo evento
        if (plugin.events) {
          const handles = Array.isArray(plugin.events)
            ? plugin.events.includes(event.name)
            : plugin.events(event.name);

          if (!handles) continue;
        }

        // Classifica per mode e strategy
        switch (plugin.mode) {
          case PluginMode.async:
            asyncPlugins.push(plugin.name);
            break;
          case PluginMode.sync:
            const strategy = plugin.metadata?.executionStrategy || 'inline';
            if (strategy === 'worker') {
              syncWorkerPlugins.push(plugin.name);
            } else {
              syncInlinePlugins.push(plugin.name);
            }
            break;
        }
      }

      if (asyncPlugins.length > 0) {
        asyncGroups.push({ event, plugins: asyncPlugins });
      }
      if (syncInlinePlugins.length > 0) {
        syncInlineGroups.push({ event, plugins: syncInlinePlugins });
      }
      if (syncWorkerPlugins.length > 0) {
        syncWorkerGroups.push({ event, plugins: syncWorkerPlugins });
      }
    }

    return {
      async: asyncGroups,
      sync: {
        inline: syncInlineGroups,
        worker: syncWorkerGroups,
      },
    };
  }

  /**
   * Esegue async plugins in parallelo
   */
  private async executeAsyncPlugins(
    groups: Array<{ event: PluginEvent; plugins: string[] }>
  ): Promise<{ results: PromiseSettledResult<void>[]; errors: Map<string, Error> }> {
    const errors = new Map<string, Error>();

    if (groups.length === 0) {
      return { results: [], errors };
    }

    // Esegue in parallelo
    const results = await Promise.allSettled(
      groups.map(async ({ event, plugins }) => {
        try {
          await this.pluginManager.triggerEvent(event, plugins);
        } catch (error) {
          const errorObj = error instanceof Error ? error : new Error(String(error));
          errors.set(event.id || event.name, errorObj);
          this.logger.error(`Async plugins failed for event ${event.id}:`, error);
          throw errorObj; // Re-throw per identificare failed event
        }
      })
    );

    const totalPlugins = groups.reduce((sum, g) => sum + g.plugins.length, 0);
    this.logger.info(`Executed ${totalPlugins} async plugin invocations across ${groups.length} events`);

    return { results, errors };
  }

  /**
   * Esegue sync plugins: inline + worker
   */
  private async executeSyncPlugins(sync: {
    inline: Array<{ event: PluginEvent; plugins: string[] }>;
    worker: Array<{ event: PluginEvent; plugins: string[] }>;
  }): Promise<{ results: PromiseSettledResult<void>[]; errors: Map<string, Error> }> {
    const errors = new Map<string, Error>();

    // Warning per worker plugins (non implementato)
    if (sync.worker.length > 0) {
      const totalPlugins = sync.worker.reduce((sum, g) => sum + g.plugins.length, 0);
      this.logger.warn(
        `Worker Lambda invocation not implemented yet. ` +
        `Total: ${totalPlugins} plugin invocations across ${sync.worker.length} events`
      );
    }

    // Esegue in parallelo
    const results = await Promise.allSettled(
      sync.inline.map(async ({ event, plugins }) => {
        try {
          await this.pluginManager.triggerEvent(event, plugins);
        } catch (error) {
          const errorObj = error instanceof Error ? error : new Error(String(error));
          errors.set(event.id || event.name, errorObj);
          this.logger.error(`Sync inline plugins failed for event ${event.id}:`, error);
          throw errorObj; // Re-throw per identificare failed event
        }
      })
    );

    return { results, errors };
  }

  /**
   * Estrae eventi falliti dai risultati (async + sync)
   */
  private extractFailedEvents(
    events: PluginEvent[],
    asyncResults: { results: PromiseSettledResult<void>[]; errors: Map<string, Error> },
    syncResults: { results: PromiseSettledResult<void>[]; errors: Map<string, Error> }
  ): PluginEvent[] {
    const failedEvents: PluginEvent[] = [];

    for (const event of events) {
      const eventKey = event.id || event.name;
      if (asyncResults.errors.has(eventKey) || syncResults.errors.has(eventKey)) {
        failedEvents.push(event);
      }
    }

    return failedEvents;
  }

  /**
   * Batch storage eventi in DynamoDB
   */
  private async batchStoreEvents(events: PluginEvent[]): Promise<void> {
    // Filtra solo eventi con ID
    const eventsWithId = events.filter((e) => !!e.id);

    if (eventsWithId.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      eventsWithId.map((event) =>
        storeEvent({
          tableName: this.config.eventsTableName,
          eventId: event.id!,
          timestamp: event.timestamp || new Date(),
          eventName: event.name,
          source: event.source,
          data: event.data,
          ttlDays: this.config.ttlDays,
        })
      )
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.error(`Failed to store ${failed}/${eventsWithId.length} events in DynamoDB`);
    } else {
      this.logger.info(`Stored ${eventsWithId.length} events in DynamoDB`);
    }
  }

  /**
   * Invia eventi falliti alla DLQ con error stack details
   */
  private async sendToDLQ(failedEvents: PluginEvent[], errors: Map<string, Error>): Promise<void> {
    if (!this.config.dlqUrl) {
      this.logger.warn(`${failedEvents.length} events failed but no DLQ configured. Events lost.`);
      return;
    }

    try {
      const entries = failedEvents.map((event, idx) => {
        const eventKey = event.id || event.name;
        const error = errors.get(eventKey);

        return {
          Id: `${idx}`,
          MessageBody: JSON.stringify({
            event,
            error: {
              message: error?.message || 'Unknown error',
              stack: error?.stack,
            },
            timestamp: new Date().toISOString(),
          }),
        };
      });

      await sendMessageBatch({
        QueueUrl: this.config.dlqUrl,
        Entries: entries,
      });

      this.logger.info(`Sent ${failedEvents.length} failed events to DLQ`);
    } catch (error) {
      this.logger.error(`Failed to send events to DLQ:`, error);
      // Non re-throw: DLQ failure non deve bloccare il batch
    }
  }
}
