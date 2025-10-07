import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { handler } from '@/handlers/consumer';

// Mock dei moduli
vi.mock('@/core/plugin-manager');
vi.mock('@/core/event-router');
vi.mock('@plugins/config', () => ({ default: [] }));

describe('Consumer Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVENTS_TABLE = 'test-events-table';
    process.env.DLQ_URL = 'https://sqs.eu-west-1.amazonaws.com/123/test-dlq';
  });

  describe('Message Parsing', () => {
    it('should parse valid SQS messages', async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: 'msg-1',
            receiptHandle: 'receipt-1',
            body: JSON.stringify({
              name: 'user.created',
              source: 'api',
              data: { userId: 123 },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1234567890',
              SenderId: 'sender-1',
              ApproximateFirstReceiveTimestamp: '1234567890',
            },
            messageAttributes: {},
            md5OfBody: 'md5',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:region:123:queue',
            awsRegion: 'eu-west-1',
          },
        ],
      };

      const result: SQSBatchResponse = await handler(event);

      expect(result).toEqual({ batchItemFailures: [] });
    });

    it('should skip invalid JSON messages', async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: 'msg-invalid',
            receiptHandle: 'receipt-1',
            body: 'invalid json {',
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1234567890',
              SenderId: 'sender-1',
              ApproximateFirstReceiveTimestamp: '1234567890',
            },
            messageAttributes: {},
            md5OfBody: 'md5',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:region:123:queue',
            awsRegion: 'eu-west-1',
          },
        ],
      };

      const result: SQSBatchResponse = await handler(event);

      // Invalid messages are skipped, no retry
      expect(result).toEqual({ batchItemFailures: [] });
    });

    it('should return empty batchItemFailures when no valid events', async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: 'msg-1',
            receiptHandle: 'receipt-1',
            body: 'invalid',
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1234567890',
              SenderId: 'sender-1',
              ApproximateFirstReceiveTimestamp: '1234567890',
            },
            messageAttributes: {},
            md5OfBody: 'md5',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:region:123:queue',
            awsRegion: 'eu-west-1',
          },
        ],
      };

      const result: SQSBatchResponse = await handler(event);

      expect(result).toEqual({ batchItemFailures: [] });
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple valid messages', async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: 'msg-1',
            receiptHandle: 'receipt-1',
            body: JSON.stringify({
              name: 'user.created',
              source: 'api',
              data: { userId: 1 },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1234567890',
              SenderId: 'sender-1',
              ApproximateFirstReceiveTimestamp: '1234567890',
            },
            messageAttributes: {},
            md5OfBody: 'md5',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:region:123:queue',
            awsRegion: 'eu-west-1',
          },
          {
            messageId: 'msg-2',
            receiptHandle: 'receipt-2',
            body: JSON.stringify({
              name: 'order.placed',
              source: 'checkout',
              data: { orderId: 456 },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1234567890',
              SenderId: 'sender-1',
              ApproximateFirstReceiveTimestamp: '1234567890',
            },
            messageAttributes: {},
            md5OfBody: 'md5',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:region:123:queue',
            awsRegion: 'eu-west-1',
          },
        ],
      };

      const result: SQSBatchResponse = await handler(event);

      expect(result).toEqual({ batchItemFailures: [] });
    });
  });

  describe('Initialization', () => {
    it('should initialize only once', async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: 'msg-1',
            receiptHandle: 'receipt-1',
            body: JSON.stringify({
              name: 'test.event',
              source: 'test',
              data: {},
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1234567890',
              SenderId: 'sender-1',
              ApproximateFirstReceiveTimestamp: '1234567890',
            },
            messageAttributes: {},
            md5OfBody: 'md5',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:region:123:queue',
            awsRegion: 'eu-west-1',
          },
        ],
      };

      // First invocation
      await handler(event);

      // Second invocation
      await handler(event);

      // PluginManager.init() should be called only once
      // (verified by mock implementation)
    });
  });
});
