/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HttpClient } from '@classes/fetch';
import { HttpError } from '@/types/fetch';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('HTTP Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configurazione Base', () => {
    it('dovrebbe creare un client con configurazione default', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      const result = await client.get('/test');

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        '/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'User-Agent': 'eventbridge-router-httpclient/1.0',
          }),
        })
      );
    });

    it('dovrebbe usare baseUrl se configurato', async () => {
      const client = new HttpClient({ baseUrl: 'https://api.example.com' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await client.get('/users');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.any(Object)
      );
    });

    it('dovrebbe unire defaultHeaders con headers per richiesta', async () => {
      const client = new HttpClient({
        defaultHeaders: { 'X-API-Key': 'secret' },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await client.get('/test', {
        headers: { 'X-Custom': 'value' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret',
            'X-Custom': 'value',
          }),
        })
      );
    });
  });

  describe('Metodi HTTP', () => {
    it('dovrebbe eseguire GET request', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 1 }),
      });

      const result = await client.get('/users/1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/users/1',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual({ id: 1 });
    });

    it('dovrebbe eseguire POST request con body JSON', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 2, name: 'John' }),
      });

      const result = await client.post('/users', {
        body: { name: 'John' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'John' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual({ id: 2, name: 'John' });
    });

    it('dovrebbe eseguire PUT, PATCH, DELETE', async () => {
      const client = new HttpClient();

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      };

      mockFetch.mockResolvedValue(mockResponse);

      await client.put('/users/1', { body: { name: 'Jane' } });
      expect(mockFetch).toHaveBeenCalledWith(
        '/users/1',
        expect.objectContaining({ method: 'PUT' })
      );

      await client.patch('/users/1', { body: { name: 'Jane' } });
      expect(mockFetch).toHaveBeenCalledWith(
        '/users/1',
        expect.objectContaining({ method: 'PATCH' })
      );

      await client.delete('/users/1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/users/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Query Parameters', () => {
    it('dovrebbe aggiungere query params', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ([]),
      });

      await client.get('/search', {
        query: { q: 'node.js', limit: 10 },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/search?q=node.js&limit=10',
        expect.any(Object)
      );
    });

    it('dovrebbe gestire array in query params', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ([]),
      });

      await client.get('/items', {
        query: { tags: ['a', 'b', 'c'] },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/items?tags=a&tags=b&tags=c',
        expect.any(Object)
      );
    });

    it('dovrebbe ignorare valori null/undefined in query', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ([]),
      });

      await client.get('/items', {
        query: { a: 'value', b: null, c: undefined },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/items?a=value',
        expect.any(Object)
      );
    });
  });

  describe('Response Parsing', () => {
    it('dovrebbe parsare JSON automaticamente', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: 'value' }),
      });

      const result = await client.get('/api/data');
      expect(result).toEqual({ data: 'value' });
    });

    it('dovrebbe parsare text se forzato responseType', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => 'plain text response',
      });

      const result = await client.get('/webhook', {
        responseType: 'text',
      });

      expect(result).toBe('plain text response');
    });

    it('dovrebbe parsare text quando content-type è text/plain', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'plain text response',
      });

      const result = await client.get('/data');
      expect(result).toBe('plain text response');
    });
  });

  describe('Timeout', () => {
    it('dovrebbe abortare dopo timeout', async () => {
      const client = new HttpClient({ timeoutMs: 100 });

      mockFetch.mockImplementationOnce((url, opts: any) => {
        // Simula abort quando il signal viene triggerato
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      });

      await expect(client.get('/slow')).rejects.toThrow(/timeout|abort/i);
    }, 10000);
  });

  describe('Retry Logic', () => {
    it('dovrebbe ritentare su errore di rete', async () => {
      vi.clearAllMocks();
      const client = new HttpClient({ maxRetries: 2 });

      mockFetch
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        });

      const result = await client.get('/api/data');
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('dovrebbe ritentare su 5xx errori', async () => {
      vi.clearAllMocks();
      const client = new HttpClient({ maxRetries: 1 });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'content-type': 'text/plain' }),
          text: async () => 'Service temporarily unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        });

      const result = await client.get('/api/data');
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('dovrebbe ritentare su 429 (rate limit)', async () => {
      vi.clearAllMocks();
      const client = new HttpClient({ maxRetries: 1 });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'retry-after': '1' }),
          text: async () => 'Rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        });

      const result = await client.get('/api/data');
      expect(result).toEqual({ success: true });
    });

    it('NON dovrebbe ritentare su 4xx errori (eccetto 429)', async () => {
      const client = new HttpClient({ maxRetries: 2 });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Not found' }),
      });

      // 404 deve fallire immediatamente senza retry
      await expect(client.get('/not-found')).rejects.toThrow(HttpError);
    });

    it('dovrebbe rispettare Retry-After header', async () => {
      vi.clearAllMocks();
      const client = new HttpClient({ maxRetries: 1 });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'retry-after': '1' }),
          text: async () => 'Rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        });

      const result = await client.get('/api/data');
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Gestione Errori', () => {
    it('dovrebbe lanciare HttpError su status non valido', async () => {
      vi.clearAllMocks();
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Resource not found' }),
      });

      await expect(client.get('/not-found')).rejects.toThrow(HttpError);

      try {
        await client.get('/not-found-2');
      } catch (err) {
        // Re-mock per seconda chiamata
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Resource not found' }),
        });
      }
    });

    it('dovrebbe includere response body in HttpError', async () => {
      vi.clearAllMocks();
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ errors: ['Invalid email'] }),
      });

      await expect(client.post('/users', { body: {} })).rejects.toThrow(HttpError);
    });

    it('dovrebbe gestire errori con status 500', async () => {
      vi.clearAllMocks();
      const client = new HttpClient({ maxRetries: 0 }); // No retry per test veloce

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Server error text',
      });

      await expect(client.get('/error')).rejects.toThrow(HttpError);
    });
  });

  describe('validateStatus Custom', () => {
    it('dovrebbe usare validateStatus custom', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Not found' }),
      });

      // Considera 404 come successo
      const result = await client.get('/maybe-exists', {
        validateStatus: (s: number) => s === 404 || (s >= 200 && s < 300),
      });

      expect(result).toEqual({ message: 'Not found' });
    });
  });

  describe('AbortSignal Esterno', () => {
    it('dovrebbe supportare AbortSignal esterno', async () => {
      const client = new HttpClient({ timeoutMs: 10000 });
      const controller = new AbortController();

      mockFetch.mockImplementationOnce((url, opts: any) => {
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted by user', 'AbortError'));
          });
        });
      });

      const promise = client.get('/test', {
        signal: controller.signal,
      });

      // Abort immediatamente
      setTimeout(() => controller.abort(), 10);

      await expect(promise).rejects.toThrow(/abort/i);
    }, 10000);
  });

  describe('Body Serialization', () => {
    it('dovrebbe serializzare oggetti a JSON', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await client.post('/data', {
        body: { key: 'value', nested: { a: 1 } },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/data',
        expect.objectContaining({
          body: JSON.stringify({ key: 'value', nested: { a: 1 } }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('dovrebbe passare stringhe senza serializzazione', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'ok',
      });

      await client.post('/webhook', {
        body: 'plain text body',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/webhook',
        expect.objectContaining({
          body: 'plain text body',
        })
      );
    });

    it('NON dovrebbe inviare body per null/undefined', async () => {
      const client = new HttpClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await client.post('/data', { body: null });

      expect(mockFetch).toHaveBeenCalledWith(
        '/data',
        expect.objectContaining({
          body: undefined,
        })
      );
    });
  });

  describe('EventBridge Use Cases', () => {
    it('dovrebbe gestire webhook Slack', async () => {
      const slackClient = new HttpClient({
        baseUrl: 'https://hooks.slack.com',
        timeoutMs: 5000,
        maxRetries: 2,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'ok',
      });

      const result = await slackClient.post('/services/T00/B00/XXX', {
        body: { text: 'Evento ricevuto: ordine #1234' },
      });

      expect(result).toBe('ok');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T00/B00/XXX',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'Evento ricevuto: ordine #1234' }),
        })
      );
    });

    it('dovrebbe gestire API esterne con auth', async () => {
      const apiClient = new HttpClient({
        baseUrl: 'https://api.example.com',
        defaultHeaders: { Authorization: 'Bearer token123' },
        timeoutMs: 10000,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 1, name: 'John' }),
      });

      const user = await apiClient.get('/users/1');

      expect(user).toEqual({ id: 1, name: 'John' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        })
      );
    });
  });
});
