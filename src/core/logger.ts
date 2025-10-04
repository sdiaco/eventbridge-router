import { Logger } from '@/types/plugin';

export interface LoggerOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  prefix?: string;
  timestamp?: boolean;
}

export class ConsoleLogger implements Logger {
  private level: 'debug' | 'info' | 'warn' | 'error';
  private prefix: string;
  private timestamp: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.prefix = options.prefix ?? '[EventBridge Router]';
    this.timestamp = options.timestamp ?? true;
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(level: string, message: string, ...args: unknown[]): string {
    const parts = [];

    if (this.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    parts.push(this.prefix);
    parts.push(`[${level.toUpperCase()}]`);
    parts.push(message);

    return parts.join(' ');
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.format('debug', message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(this.format('info', message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message), ...args);
    }
  }
}

export function createLogger(options?: LoggerOptions): Logger {
  return new ConsoleLogger(options);
}
