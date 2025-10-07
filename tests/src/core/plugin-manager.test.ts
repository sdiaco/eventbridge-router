/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '@/core/plugin-manager';
import { Plugin, PluginContext, PluginEvent, Logger } from '@/types/plugin';

// Mock logger
const createMockLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

// Mock plugin factory
const createMockPlugin = (
  name: string,
  events?: string[],
  hooks?: Partial<Plugin>
): Plugin => ({
  name,
  events,
  init: vi.fn(),
  onEvent: vi.fn(),
  onReplay: vi.fn(),
  onDLQ: vi.fn(),
  onError: vi.fn(),
  destroy: vi.fn(),
  metadata: {
    version: '1.0.0',
    description: `Mock plugin ${name}`,
    owner: 'test',
  },
  ...hooks,
});

describe('PluginManager', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  describe('Registrazione Plugin', () => {
    it('dovrebbe registrare un plugin', () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('test-plugin');

      pm.register(plugin);

      expect(logger.info).toHaveBeenCalledWith('Plugin registered: test-plugin');
      expect(pm.getPlugin('test-plugin')).toBe(plugin);
    });

    it('dovrebbe registrare più plugin con registerAll', () => {
      const pm = new PluginManager({ logger });
      const plugins = [
        createMockPlugin('plugin-1'),
        createMockPlugin('plugin-2'),
        createMockPlugin('plugin-3'),
      ];

      pm.registerAll(plugins);

      expect(pm.listPlugins()).toEqual(['plugin-1', 'plugin-2', 'plugin-3']);
    });

    it('dovrebbe lanciare errore se plugin già registrato', () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('duplicate');

      pm.register(plugin);

      expect(() => pm.register(plugin)).toThrow('Plugin "duplicate" already registered');
    });
  });

  describe('Inizializzazione', () => {
    it('dovrebbe inizializzare tutti i plugin con init()', async () => {
      const pm = new PluginManager({ logger });
      const plugin1 = createMockPlugin('plugin-1');
      const plugin2 = createMockPlugin('plugin-2');

      pm.registerAll([plugin1, plugin2]);
      await pm.init();

      expect(plugin1.init).toHaveBeenCalledTimes(1);
      expect(plugin2.init).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Initializing 2 plugins...');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('All plugins initialized in'));
    });

    it('dovrebbe passare context corretto a init()', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('test-plugin');

      pm.register(plugin);
      await pm.init();

      expect(plugin.init).toHaveBeenCalledWith(
        expect.objectContaining({
          emit: expect.any(Function),
          config: expect.any(Object),
          logger: logger,
        })
      );
    });

    it('dovrebbe inizializzare plugin in parallelo', async () => {
      const pm = new PluginManager({ logger });
      const delays: number[] = [];

      const plugin1 = createMockPlugin('plugin-1', undefined, {
        init: vi.fn(async () => {
          delays.push(Date.now());
          await new Promise(resolve => setTimeout(resolve, 50));
        }),
      });

      const plugin2 = createMockPlugin('plugin-2', undefined, {
        init: vi.fn(async () => {
          delays.push(Date.now());
          await new Promise(resolve => setTimeout(resolve, 50));
        }),
      });

      pm.registerAll([plugin1, plugin2]);

      const start = Date.now();
      await pm.init();
      const duration = Date.now() - start;

      // Se fossero seriali: >100ms, se paralleli: ~50ms
      expect(duration).toBeLessThan(100);
      expect(delays[0]).toBeLessThan(delays[1] + 10); // Avviati quasi simultaneamente
    });

    it('dovrebbe skippare plugin senza init()', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('no-init', undefined, { init: undefined });

      pm.register(plugin);
      await pm.init();

      expect(logger.info).toHaveBeenCalledWith('Initializing 1 plugins...');
    });

    it('dovrebbe lanciare errore se init() fallisce', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('failing', undefined, {
        init: vi.fn().mockRejectedValue(new Error('Init failed')),
      });

      pm.register(plugin);

      await expect(pm.init()).rejects.toThrow('Init failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize plugin "failing":',
        expect.any(Error)
      );
    });

    it('NON dovrebbe re-inizializzare se già initialized', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('test');

      pm.register(plugin);
      await pm.init();
      await pm.init(); // seconda chiamata

      expect(plugin.init).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith('PluginManager already initialized');
    });
  });

  describe('Destroy', () => {
    it('dovrebbe distruggere tutti i plugin', async () => {
      const pm = new PluginManager({ logger });
      const plugin1 = createMockPlugin('plugin-1');
      const plugin2 = createMockPlugin('plugin-2');

      pm.registerAll([plugin1, plugin2]);
      await pm.init();
      await pm.destroy();

      expect(plugin1.destroy).toHaveBeenCalledTimes(1);
      expect(plugin2.destroy).toHaveBeenCalledTimes(1);
      expect(pm.listPlugins()).toEqual([]);
    });

    it('dovrebbe skippare plugin senza destroy()', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('no-destroy', undefined, { destroy: undefined });

      pm.register(plugin);
      await pm.init();
      await pm.destroy();

      expect(logger.info).toHaveBeenCalledWith('All plugins destroyed');
    });

    it('NON dovrebbe bloccare se destroy() fallisce', async () => {
      const pm = new PluginManager({ logger });
      const plugin1 = createMockPlugin('failing', undefined, {
        destroy: vi.fn().mockRejectedValue(new Error('Destroy failed')),
      });
      const plugin2 = createMockPlugin('working');

      pm.registerAll([plugin1, plugin2]);
      await pm.init();
      await pm.destroy();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to destroy plugin "failing":',
        expect.any(Error)
      );
      expect(plugin2.destroy).toHaveBeenCalled();
    });
  });

  describe('triggerEvent - Filtro Eventi', () => {
    it('dovrebbe eseguire solo plugin con events matching', async () => {
      const pm = new PluginManager({ logger });
      const plugin1 = createMockPlugin('slack', ['user.created', 'order.placed']);
      const plugin2 = createMockPlugin('logger', ['user.created']);
      const plugin3 = createMockPlugin('analytics', ['order.placed']);

      pm.registerAll([plugin1, plugin2, plugin3]);
      await pm.init();

      const event: PluginEvent = {
        name: 'user.created',
        source: 'auth-service',
        data: { userId: 123 },
      };

      await pm.triggerEvent(event);

      expect(plugin1.onEvent).toHaveBeenCalledWith(event, expect.any(Object));
      expect(plugin2.onEvent).toHaveBeenCalledWith(event, expect.any(Object));
      expect(plugin3.onEvent).not.toHaveBeenCalled();
    });

    it('dovrebbe eseguire tutti i plugin se events non specificato', async () => {
      const pm = new PluginManager({ logger });
      const plugin1 = createMockPlugin('universal-1'); // no events filter
      const plugin2 = createMockPlugin('universal-2');

      pm.registerAll([plugin1, plugin2]);
      await pm.init();

      const event: PluginEvent = {
        name: 'any.event',
        source: 'test',
        data: {},
      };

      await pm.triggerEvent(event);

      expect(plugin1.onEvent).toHaveBeenCalled();
      expect(plugin2.onEvent).toHaveBeenCalled();
    });

    it('dovrebbe supportare filtro con funzione custom', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('custom-filter', undefined, {
        events: (eventName: string) => eventName.startsWith('user.'),
      });

      pm.register(plugin);
      await pm.init();

      await pm.triggerEvent({ name: 'user.created', source: 'test', data: {} });
      expect(plugin.onEvent).toHaveBeenCalled();

      vi.clearAllMocks();

      await pm.triggerEvent({ name: 'order.placed', source: 'test', data: {} });
      expect(plugin.onEvent).not.toHaveBeenCalled();
    });

    it('dovrebbe eseguire solo plugin specificati in pluginNames', async () => {
      const pm = new PluginManager({ logger });
      const plugin1 = createMockPlugin('plugin-1', ['test.event']);
      const plugin2 = createMockPlugin('plugin-2', ['test.event']);

      pm.registerAll([plugin1, plugin2]);
      await pm.init();

      await pm.triggerEvent(
        { name: 'test.event', source: 'test', data: {} },
        ['plugin-1']
      );

      expect(plugin1.onEvent).toHaveBeenCalled();
      expect(plugin2.onEvent).not.toHaveBeenCalled();
    });
  });

  describe('triggerEvent - Esecuzione', () => {
    it('dovrebbe eseguire plugin in parallelo', async () => {
      const pm = new PluginManager({ logger });
      const delays: number[] = [];

      const plugin1 = createMockPlugin('plugin-1', ['test'], {
        onEvent: vi.fn(async () => {
          delays.push(Date.now());
          await new Promise(resolve => setTimeout(resolve, 50));
        }),
      });

      const plugin2 = createMockPlugin('plugin-2', ['test'], {
        onEvent: vi.fn(async () => {
          delays.push(Date.now());
          await new Promise(resolve => setTimeout(resolve, 50));
        }),
      });

      pm.registerAll([plugin1, plugin2]);
      await pm.init();

      const start = Date.now();
      await pm.triggerEvent({ name: 'test', source: 'test', data: {} });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('dovrebbe gestire errore e chiamare onError', async () => {
      const pm = new PluginManager({ logger });
      const testError = new Error('Plugin error');
      const plugin = createMockPlugin('failing-plugin', ['test.event'], {
        onEvent: vi.fn().mockRejectedValue(testError),
      });

      pm.register(plugin);
      await pm.init();

      await pm.triggerEvent({ name: 'test.event', source: 'test', data: {} });

      expect(logger.error).toHaveBeenCalledWith(
        'Plugin "failing-plugin" failed on event:',
        testError
      );
      expect(plugin.onError).toHaveBeenCalledWith(
        testError,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('NON dovrebbe bloccare altri plugin se uno fallisce', async () => {
      const pm = new PluginManager({ logger });
      const failingPlugin = createMockPlugin('failing', ['test'], {
        onEvent: vi.fn().mockRejectedValue(new Error('Fail')),
      });
      const workingPlugin = createMockPlugin('working', ['test']);

      pm.registerAll([failingPlugin, workingPlugin]);
      await pm.init();

      await pm.triggerEvent({ name: 'test', source: 'test', data: {} });

      expect(failingPlugin.onEvent).toHaveBeenCalled();
      expect(workingPlugin.onEvent).toHaveBeenCalled();
    });

    it('dovrebbe loggare errore se onError fallisce', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('double-failing', ['test'], {
        onEvent: vi.fn().mockRejectedValue(new Error('First error')),
        onError: vi.fn().mockRejectedValue(new Error('onError failed')),
      });

      pm.register(plugin);
      await pm.init();

      await pm.triggerEvent({ name: 'test', source: 'test', data: {} });

      expect(logger.error).toHaveBeenCalledWith(
        'Plugin "double-failing" onError handler failed:',
        expect.any(Error)
      );
    });

    it('dovrebbe lanciare errore se non inizializzato', async () => {
      const pm = new PluginManager({ logger });

      await expect(
        pm.triggerEvent({ name: 'test', source: 'test', data: {} })
      ).rejects.toThrow('PluginManager not initialized');
    });
  });

  describe('triggerReplay', () => {
    it('dovrebbe eseguire onReplay sui plugin filtrati', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('test-plugin', ['replay.event']);

      pm.register(plugin);
      await pm.init();

      await pm.triggerReplay({ name: 'replay.event', source: 'test', data: {} });

      expect(plugin.onReplay).toHaveBeenCalled();
    });

    it('dovrebbe gestire errori in onReplay', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('failing', ['test'], {
        onReplay: vi.fn().mockRejectedValue(new Error('Replay failed')),
      });

      pm.register(plugin);
      await pm.init();

      await pm.triggerReplay({ name: 'test', source: 'test', data: {} });

      expect(logger.error).toHaveBeenCalledWith(
        'Plugin "failing" failed on replay:',
        expect.any(Error)
      );
    });
  });

  describe('triggerDLQ', () => {
    it('dovrebbe eseguire onDLQ sui plugin filtrati', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('test-plugin', ['dlq.event']);

      pm.register(plugin);
      await pm.init();

      await pm.triggerDLQ({ name: 'dlq.event', source: 'test', data: {} });

      expect(plugin.onDLQ).toHaveBeenCalled();
    });

    it('dovrebbe gestire errori in onDLQ', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('failing', ['test'], {
        onDLQ: vi.fn().mockRejectedValue(new Error('DLQ failed')),
      });

      pm.register(plugin);
      await pm.init();

      await pm.triggerDLQ({ name: 'test', source: 'test', data: {} });

      expect(logger.error).toHaveBeenCalledWith(
        'Plugin "failing" failed on DLQ:',
        expect.any(Error)
      );
    });
  });

  describe('Context - emit()', () => {
    it('dovrebbe permettere a plugin di emettere nuovi eventi', async () => {
      const pm = new PluginManager({ logger });
      const emitterPlugin = createMockPlugin('emitter', ['trigger.event'], {
        onEvent: vi.fn(async (event: PluginEvent, context: PluginContext) => {
          context.emit({
            name: 'emitted.event',
            source: 'emitter',
            data: { from: event.name },
          });
        }),
      });

      const listenerPlugin = createMockPlugin('listener', ['emitted.event']);

      pm.registerAll([emitterPlugin, listenerPlugin]);
      await pm.init();

      await pm.triggerEvent({ name: 'trigger.event', source: 'test', data: {} });

      // Aspetta un po' per l'evento asincrono emesso
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(listenerPlugin.onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'emitted.event' }),
        expect.any(Object)
      );
    });
  });

  describe('Config per-plugin', () => {
    it('dovrebbe passare config specifico al plugin', async () => {
      const pm = new PluginManager({
        logger,
        config: {
          'slack-notifier': { webhookUrl: 'https://slack.com/webhook' },
          'email-sender': { apiKey: 'email-key' },
        },
      });

      const slackPlugin = createMockPlugin('slack-notifier', ['test']);
      pm.register(slackPlugin);
      await pm.init();

      expect(slackPlugin.init).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { webhookUrl: 'https://slack.com/webhook' },
        })
      );
    });

    it('dovrebbe passare config vuoto se non specificato', async () => {
      const pm = new PluginManager({ logger });
      const plugin = createMockPlugin('no-config', ['test']);

      pm.register(plugin);
      await pm.init();

      expect(plugin.init).toHaveBeenCalledWith(
        expect.objectContaining({ config: {} })
      );
    });
  });
});
