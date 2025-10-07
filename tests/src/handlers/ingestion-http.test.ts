import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handler } from '@/handlers/ingestion-http';
import * as sqsService from '@/services/sqs';

vi.mock('@/services/sqs');

describe('Ingestion HTTP Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRIMARY_QUEUE_URL = 'https://sqs.eu-west-1.amazonaws.com/123/test-queue';
  });

  const createMockEvent = (body: string): APIGatewayProxyEvent => ({
    body,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/events',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123',
      apiId: 'api-1',
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      path: '/events',
      stage: 'dev',
      requestId: 'req-1',
      requestTimeEpoch: 123456789,
      resourceId: 'res-1',
      resourcePath: '/events',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '1.2.3.4',
        user: null,
        userAgent: 'test',
        userArn: null,
      },
      authorizer: null,
    },
    resource: '/events',
  });

  describe('Configuration', () => {
    it('should return 500 if PRIMARY_QUEUE_URL not configured', async () => {
      delete process.env.PRIMARY_QUEUE_URL;

      const event = createMockEvent(JSON.stringify({ name: 'test', source: 'test', data: {} }));
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ error: 'Internal configuration error' });
    });
  });

  describe('Input Validation', () => {
    it('should return 400 if body is missing', async () => {
      const event = createMockEvent('');
      event.body = null;

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ error: 'Missing request body' });
    });

    it('should return 400 if body is invalid JSON', async () => {
      const event = createMockEvent('invalid json {');

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ error: 'Invalid JSON body' });
    });

    it('should return 400 if event is missing required fields', async () => {
      const event = createMockEvent(JSON.stringify({ name: 'test' })); // missing source, data

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Invalid event format. Required: name, source, data',
      });
    });
  });

  describe('Event Processing', () => {
    it('should queue single event to SQS', async () => {
      vi.spyOn(sqsService, 'sendMessageBatch').mockResolvedValue(undefined);

      const event = createMockEvent(
        JSON.stringify({
          name: 'user.created',
          source: 'api',
          data: { userId: 123 },
        })
      );

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(202);
      expect(JSON.parse(result.body)).toEqual({
        message: 'Event queued successfully',
      });

      expect(sqsService.sendMessageBatch).toHaveBeenCalledWith({
        QueueUrl: 'https://sqs.eu-west-1.amazonaws.com/123/test-queue',
        Entries: [
          {
            Id: '0',
            MessageBody: JSON.stringify({
              name: 'user.created',
              source: 'api',
              data: { userId: 123 },
            }),
          },
        ],
      });
    });

    it('should return 500 if SQS fails', async () => {
      vi.spyOn(sqsService, 'sendMessageBatch').mockRejectedValue(new Error('SQS Error'));

      const event = createMockEvent(
        JSON.stringify({
          name: 'test.event',
          source: 'test',
          data: {},
        })
      );

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ error: 'Failed to queue event' });
    });
  });
});
