import { Plugin, PluginContext, PluginEvent, Logger } from '@/types/plugin';
import { IHttpClient } from '@/types/fetch';
import { PluginManagerOptions } from '@/types/plugin-manager';

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private logger: Logger;
  private http?: IHttpClient;
  private config: Record<string, Record<string, unknown>>;
  private initialized = false;

  constructor(options: PluginManagerOptions) {
    this.logger = options.logger;
    this.http = options.http;
    this.config = options.config || {};
  }

  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('PluginManager already initialized');
      return;
    }

    this.logger.info(`Initializing ${this.plugins.size} plugins...`);
    const startTime = Date.now();

    const initPromises = Array.from(this.plugins.entries()).map(async ([name, plugin]) => {
      if (!plugin.init) return;

      try {
        const context = this.createContext(name);
        await plugin.init(context);
        this.logger.info(`Plugin initialized: ${name}`);
      } catch (err) {
        this.logger.error(`Failed to initialize plugin "${name}":`, err);
        throw err;
      }
    });

    await Promise.all(initPromises);

    this.initialized = true;
    const duration = Date.now() - startTime;
    this.logger.info(`All plugins initialized in ${duration}ms`);
  }

  async destroy(): Promise<void> {
    if (!this.initialized) return;

    this.logger.info('Destroying plugins...');

    for (const [name, plugin] of this.plugins.entries()) {
      if (plugin.destroy) {
        try {
          await plugin.destroy();
          this.logger.info(`Plugin destroyed: ${name}`);
        } catch (err) {
          this.logger.error(`Failed to destroy plugin "${name}":`, err);
        }
      }
    }

    this.plugins.clear();
    this.initialized = false;
    this.logger.info('All plugins destroyed');
  }

  async triggerEvent(event: PluginEvent, pluginNames?: string[]): Promise<void> {
    await this.executeHook(event, pluginNames, {
      hookName: 'onEvent',
      errorContext: 'on event'
    });
  }

  async triggerReplay(event: PluginEvent, pluginNames?: string[]): Promise<void> {
    await this.executeHook(event, pluginNames, {
      hookName: 'onReplay',
      errorContext: 'on replay'
    });
  }

  async triggerDLQ(event: PluginEvent, pluginNames?: string[]): Promise<void> {
    await this.executeHook(event, pluginNames, {
      hookName: 'onDLQ',
      errorContext: 'on DLQ'
    });
  }

  private async executeHook(
    event: PluginEvent,
    pluginNames: string[] | undefined,
    strategy: {
      hookName: 'onEvent' | 'onReplay' | 'onDLQ';
      errorContext: string;
    }
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('PluginManager not initialized. Call init() first.');
    }

    const allPlugins = pluginNames
      ? pluginNames.map(name => this.plugins.get(name)).filter(Boolean) as Plugin[]
      : Array.from(this.plugins.values());

    const targets = allPlugins.filter(p => this.shouldHandleEvent(p, event.name));

    await Promise.allSettled(
      targets.map(async plugin => {
        // Fallback: se onReplay non esiste, usa onEvent
        let hook = plugin[strategy.hookName];
        if (!hook && strategy.hookName === 'onReplay') {
          hook = plugin.onEvent;
        }

        if (!hook) return;

        const context = this.createContext(plugin.name);
        try {
          await hook(event, context);
        } catch (err) {
          this.logger.error(`Plugin "${plugin.name}" failed ${strategy.errorContext}:`, err);

          if (plugin.onError) {
            try {
              await plugin.onError(err as Error, event, context);
            } catch (onErrorErr) {
              this.logger.error(`Plugin "${plugin.name}" onError handler failed:`, onErrorErr);
            }
          }
        }
      })
    );
  }

  private shouldHandleEvent(plugin: Plugin, eventName: string): boolean {
    if (!plugin.events) return true; // nessun filtro = tutti gli eventi

    if (Array.isArray(plugin.events)) {
      return plugin.events.includes(eventName);
    }

    return plugin.events(eventName); // funzione custom
  }

  private createContext(pluginName: string): PluginContext {
    return {
      emit: (event: PluginEvent) => {
        this.logger.debug(`Plugin "${pluginName}" emitted event:`, event);
        this.triggerEvent(event).catch(err => {
          this.logger.error('Failed to trigger emitted event:', err);
        });
      },
      config: this.config[pluginName] || {},
      logger: this.logger,
      http: this.http,
    };
  }

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" already registered`);
    }
    this.plugins.set(plugin.name, plugin);
    this.logger.info(`Plugin registered: ${plugin.name}`);
  }

  registerAll(plugins: Plugin[]): void {
    plugins.forEach(p => this.register(p));
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }
}
