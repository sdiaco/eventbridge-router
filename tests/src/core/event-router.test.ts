/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventRouter } from '@/core/event-router';
import { PluginManager } from '@/core/plugin-manager';
import { PluginEvent, PluginMode, Logger } from '@/types/plugin';
import { EventRouterConfig } from '@/types/event-router';

// Mock dei servizi
vi.mock('@/services/dynamodb', () => ({
  batchCheckDuplicates: vi.fn(),
  storeEvent: vi.fn(),
}));

vi.mock('@/services/sqs', () => ({
  sendMessageBatch: vi.fn(),
}));

import { batchCheckDuplicates, storeEvent } from '@/services/dynamodb';
import { sendMessageBatch } from '@/services/sqs';

// Mock logger
const createMockLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

// Mock PluginManager
const createMockPluginManager = (): PluginManager => {
  const pm = {
    listPlugins: vi.fn().mockReturnValue([]),
    getPlugin: vi.fn(),
    triggerEvent: vi.fn(),
  } as any;
  return pm;
};

describe('EventRouter', () => {
  let logger: Logger;
  let pluginManager: PluginManager;
  let config: EventRouterConfig;

  beforeEach(() => {
    logger = createMockLogger();
    pluginManager = createMockPluginManager();
    config = {
      eventsTableName: 'EventsTable',
      dlqUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/dlq',
      batchSize: 50,
      ttlDays: 30,
    };
    vi.clearAllMocks();
  });

  describe('processBatch - Empty batch', () => {
    it('should skip processing for empty batch', async () => {
      const router = new EventRouter(pluginManager, config, logger);

      await router.processBatch([]);

      expect(logger.info).toHaveBeenCalledWith('Empty batch, skipping processing');
      expect(batchCheckDuplicates).not.toHaveBeenCalled();
    });
  });

  describe('processBatch - Batch deduplication', () => {
    it('should filter duplicate events using batch check', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {} },
        { id: 'event-2', name: 'test.event', source: 'test', data: {} },
        { id: 'event-3', name: 'test.event', source: 'test', data: {} },
      ];

      // event-2 è duplicato
      (batchCheckDuplicates as any).mockResolvedValue(new Set(['event-2']));
      (storeEvent as any).mockResolvedValue(undefined);

      await router.processBatch(events);

      expect(batchCheckDuplicates).toHaveBeenCalledWith({
        tableName: 'EventsTable',
        eventIds: ['event-1', 'event-2', 'event-3'],
      });
      expect(logger.warn).toHaveBeenCalledWith('Found 1 duplicate events, skipping them');
      expect(logger.info).toHaveBeenCalledWith('After deduplication: 2 unique events');
    });

    it('should process all events when no duplicates found', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {} },
        { id: 'event-2', name: 'test.event', source: 'test', data: {} },
      ];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      await router.processBatch(events);

      expect(logger.info).toHaveBeenCalledWith('After deduplication: 2 unique events');
      expect(storeEvent).toHaveBeenCalledTimes(2);
    });

    it('should skip processing if all events are duplicates', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {} },
        { id: 'event-2', name: 'test.event', source: 'test', data: {} },
      ];

      (batchCheckDuplicates as any).mockResolvedValue(new Set(['event-1', 'event-2']));

      await router.processBatch(events);

      expect(logger.info).toHaveBeenCalledWith('All events are duplicates, skipping processing');
      expect(storeEvent).not.toHaveBeenCalled();
      expect(pluginManager.triggerEvent).not.toHaveBeenCalled();
    });

    it('should handle events without ID (not deduplicated)', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {} },
        { name: 'test.event', source: 'test', data: {} }, // no ID
      ];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      await router.processBatch(events);

      expect(batchCheckDuplicates).toHaveBeenCalledWith({
        tableName: 'EventsTable',
        eventIds: ['event-1'], // solo event-1 ha ID
      });
      expect(logger.info).toHaveBeenCalledWith('After deduplication: 2 unique events');
      expect(storeEvent).toHaveBeenCalledTimes(1); // solo event-1 viene salvato
    });

    it('should fallback to processing all events on deduplication error', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {} },
      ];

      (batchCheckDuplicates as any).mockRejectedValue(new Error('DynamoDB error'));
      (storeEvent as any).mockResolvedValue(undefined);

      await router.processBatch(events);

      expect(logger.error).toHaveBeenCalledWith(
        'Batch deduplication failed, falling back to processing all events:',
        expect.any(Error)
      );
      expect(logger.info).toHaveBeenCalledWith('After deduplication: 1 unique events');
    });
  });

  describe('processBatch - Plugin grouping by mode', () => {
    it('should execute async plugins', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [{ id: 'event-1', name: 'test.event', source: 'test', data: {} }];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['async-plugin']);
      (pluginManager.getPlugin as any).mockReturnValue({
        name: 'async-plugin',
        mode: PluginMode.async,
        events: ['test.event'],
      });

      await router.processBatch(events);

      expect(pluginManager.triggerEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'event-1' }),
        ['async-plugin']
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Executed 1 async plugin invocations')
      );
    });

    it('should group events by sync inline plugins', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [{ id: 'event-1', name: 'test.event', source: 'test', data: {} }];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['sync-plugin']);
      (pluginManager.getPlugin as any).mockReturnValue({
        name: 'sync-plugin',
        mode: PluginMode.sync,
        events: ['test.event'],
        metadata: { executionStrategy: 'inline', version: '1.0.0', description: 'Test', owner: 'test' },
      });

      await router.processBatch(events);

      expect(pluginManager.triggerEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'event-1' }),
        ['sync-plugin']
      );
    });

    it('should warn for sync worker plugins', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [{ id: 'event-1', name: 'test.event', source: 'test', data: {} }];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['worker-plugin']);
      (pluginManager.getPlugin as any).mockReturnValue({
        name: 'worker-plugin',
        mode: PluginMode.sync,
        events: ['test.event'],
        metadata: { executionStrategy: 'worker', version: '1.0.0', description: 'Test', owner: 'test' },
      });

      await router.processBatch(events);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Worker Lambda invocation not implemented yet')
      );
    });

    it('should skip plugins that do not match event name', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [{ id: 'event-1', name: 'test.event', source: 'test', data: {} }];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['non-matching-plugin']);
      (pluginManager.getPlugin as any).mockReturnValue({
        name: 'non-matching-plugin',
        mode: PluginMode.sync,
        events: ['other.event'], // non matcha
      });

      await router.processBatch(events);

      expect(pluginManager.triggerEvent).not.toHaveBeenCalled();
    });
  });

  describe('processBatch - Execution order', () => {
    it('should execute async plugins before sync plugins', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [{ id: 'event-1', name: 'test.event', source: 'test', data: {} }];

      const executionOrder: string[] = [];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['async-plugin', 'sync-plugin']);
      (pluginManager.getPlugin as any).mockImplementation((name: string) => {
        if (name === 'async-plugin') {
          return {
            name: 'async-plugin',
            mode: PluginMode.async,
            events: ['test.event'],
          };
        }
        return {
          name: 'sync-plugin',
          mode: PluginMode.sync,
          events: ['test.event'],
          metadata: { executionStrategy: 'inline', version: '1.0.0', description: 'Test', owner: 'test' },
        };
      });

      (pluginManager.triggerEvent as any).mockImplementation(async (event: any, plugins: string[]) => {
        if (plugins.includes('async-plugin')) {
          executionOrder.push('async');
        }
        if (plugins.includes('sync-plugin')) {
          executionOrder.push('sync');
        }
      });

      await router.processBatch(events);

      expect(executionOrder).toEqual(['async', 'sync']);
    });
  });

  describe('processBatch - Failure handling', () => {
    it('should extract failed async events and send to DLQ', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {} },
        { id: 'event-2', name: 'test.event', source: 'test', data: {} },
      ];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['async-plugin']);
      (pluginManager.getPlugin as any).mockReturnValue({
        name: 'async-plugin',
        mode: PluginMode.async,
        events: ['test.event'],
      });

      // event-1 fails, event-2 succeeds
      (pluginManager.triggerEvent as any).mockImplementation(async (event: PluginEvent) => {
        if (event.id === 'event-1') {
          throw new Error('Async plugin execution failed');
        }
      });

      (sendMessageBatch as any).mockResolvedValue({});

      await router.processBatch(events);

      expect(sendMessageBatch).toHaveBeenCalledWith({
        QueueUrl: config.dlqUrl,
        Entries: expect.arrayContaining([
          expect.objectContaining({
            MessageBody: expect.stringContaining('event-1'),
          }),
        ]),
      });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('1 succeeded, 1 failed'));
      expect(storeEvent).toHaveBeenCalledTimes(1); // solo event-2
    });

    it('should extract failed sync events and send to DLQ', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {} },
        { id: 'event-2', name: 'test.event', source: 'test', data: {} },
      ];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['sync-plugin']);
      (pluginManager.getPlugin as any).mockReturnValue({
        name: 'sync-plugin',
        mode: PluginMode.sync,
        events: ['test.event'],
        metadata: { executionStrategy: 'inline', version: '1.0.0', description: 'Test', owner: 'test' },
      });

      // event-1 fails, event-2 succeeds
      (pluginManager.triggerEvent as any).mockImplementation(async (event: PluginEvent) => {
        if (event.id === 'event-1') {
          throw new Error('Plugin execution failed');
        }
      });

      (sendMessageBatch as any).mockResolvedValue({});

      await router.processBatch(events);

      expect(sendMessageBatch).toHaveBeenCalledWith({
        QueueUrl: config.dlqUrl,
        Entries: expect.arrayContaining([
          expect.objectContaining({
            MessageBody: expect.stringContaining('event-1'),
          }),
        ]),
      });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('1 succeeded, 1 failed'));
      expect(storeEvent).toHaveBeenCalledTimes(1); // solo event-2
    });

    it('should extract failed async and sync events and send to DLQ', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {} },
        { id: 'event-2', name: 'test.event', source: 'test', data: {} },
        { id: 'event-3', name: 'test.event', source: 'test', data: {} },
      ];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['async-plugin', 'sync-plugin']);
      (pluginManager.getPlugin as any).mockImplementation((name: string) => {
        if (name === 'async-plugin') {
          return {
            name: 'async-plugin',
            mode: PluginMode.async,
            events: ['test.event'],
          };
        }
        return {
          name: 'sync-plugin',
          mode: PluginMode.sync,
          events: ['test.event'],
          metadata: { executionStrategy: 'inline', version: '1.0.0', description: 'Test', owner: 'test' },
        };
      });

      // event-1 async fails, event-2 sync fails, event-3 succeeds
      (pluginManager.triggerEvent as any).mockImplementation(async (event: PluginEvent, plugins: string[]) => {
        if (event.id === 'event-1' && plugins.includes('async-plugin')) {
          throw new Error('Async plugin failed');
        }
        if (event.id === 'event-2' && plugins.includes('sync-plugin')) {
          throw new Error('Sync plugin failed');
        }
      });

      (sendMessageBatch as any).mockResolvedValue({});

      await router.processBatch(events);

      expect(sendMessageBatch).toHaveBeenCalledWith({
        QueueUrl: config.dlqUrl,
        Entries: expect.arrayContaining([
          expect.objectContaining({
            MessageBody: expect.stringContaining('event-1'),
          }),
          expect.objectContaining({
            MessageBody: expect.stringContaining('event-2'),
          }),
        ]),
      });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('1 succeeded, 2 failed'));
      expect(storeEvent).toHaveBeenCalledTimes(1); // solo event-3
    });

    it('should warn if no DLQ configured', async () => {
      const configNoDLQ: EventRouterConfig = {
        eventsTableName: 'EventsTable',
        // no dlqUrl
      };

      const router = new EventRouter(pluginManager, configNoDLQ, logger);
      const events: PluginEvent[] = [{ id: 'event-1', name: 'test.event', source: 'test', data: {} }];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['sync-plugin']);
      (pluginManager.getPlugin as any).mockReturnValue({
        name: 'sync-plugin',
        mode: PluginMode.sync,
        events: ['test.event'],
        metadata: { executionStrategy: 'inline', version: '1.0.0', description: 'Test', owner: 'test' },
      });

      (pluginManager.triggerEvent as any).mockRejectedValue(new Error('Plugin failed'));

      await router.processBatch(events);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('events failed but no DLQ configured. Events lost.')
      );
      expect(sendMessageBatch).not.toHaveBeenCalled();
    });

    it('should include error stack in DLQ message', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [{ id: 'event-1', name: 'test.event', source: 'test', data: {} }];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['sync-plugin']);
      (pluginManager.getPlugin as any).mockReturnValue({
        name: 'sync-plugin',
        mode: PluginMode.sync,
        events: ['test.event'],
        metadata: { executionStrategy: 'inline', version: '1.0.0', description: 'Test', owner: 'test' },
      });

      const testError = new Error('Test error with stack');
      (pluginManager.triggerEvent as any).mockRejectedValue(testError);
      (sendMessageBatch as any).mockResolvedValue({});

      await router.processBatch(events);

      expect(sendMessageBatch).toHaveBeenCalledWith({
        QueueUrl: config.dlqUrl,
        Entries: [
          {
            Id: '0',
            MessageBody: expect.stringContaining('"stack"'),
          },
        ],
      });
    });

    it('should handle DLQ send failure gracefully', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [{ id: 'event-1', name: 'test.event', source: 'test', data: {} }];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockReturnValue(['sync-plugin']);
      (pluginManager.getPlugin as any).mockReturnValue({
        name: 'sync-plugin',
        mode: PluginMode.sync,
        events: ['test.event'],
        metadata: { executionStrategy: 'inline', version: '1.0.0', description: 'Test', owner: 'test' },
      });

      (pluginManager.triggerEvent as any).mockRejectedValue(new Error('Plugin failed'));
      (sendMessageBatch as any).mockRejectedValue(new Error('DLQ send failed'));

      await router.processBatch(events);

      expect(logger.error).toHaveBeenCalledWith('Failed to send events to DLQ:', expect.any(Error));
    });
  });

  describe('processBatch - Batch storage', () => {
    it('should store all successful events in batch', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {}, timestamp: new Date() },
        { id: 'event-2', name: 'test.event', source: 'test', data: {}, timestamp: new Date() },
      ];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      await router.processBatch(events);

      expect(storeEvent).toHaveBeenCalledTimes(2);
      expect(storeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'EventsTable',
          eventId: 'event-1',
          ttlDays: 30,
        })
      );
    });

    it('should log error if some storage operations fail', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [
        { id: 'event-1', name: 'test.event', source: 'test', data: {} },
        { id: 'event-2', name: 'test.event', source: 'test', data: {} },
      ];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('DynamoDB error'));

      await router.processBatch(events);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to store 1/2 events in DynamoDB'));
    });
  });

  describe('processBatch - Critical errors', () => {
    it('should re-throw critical errors for Lambda retry', async () => {
      const router = new EventRouter(pluginManager, config, logger);
      const events: PluginEvent[] = [{ id: 'event-1', name: 'test.event', source: 'test', data: {} }];

      (batchCheckDuplicates as any).mockResolvedValue(new Set());
      (storeEvent as any).mockResolvedValue(undefined);

      (pluginManager.listPlugins as any).mockImplementation(() => {
        throw new Error('Critical plugin manager error');
      });

      await expect(router.processBatch(events)).rejects.toThrow('Critical plugin manager error');

      expect(logger.error).toHaveBeenCalledWith('Critical error in batch processing:', expect.any(Error));
    });
  });
});
