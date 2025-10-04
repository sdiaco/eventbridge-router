import type { Message, MessageAttributeValue } from '@aws-sdk/client-sqs';

export interface SendMessageParameters {
  QueueUrl: string;
  MessageBody: string;
  MessageGroupId?: string;
  MessageDeduplicationId?: string;
  MessageAttributes?: Record<string, MessageAttributeValue>;
  DelaySeconds?: number;
}

export interface SendMessageBatchParameters {
  QueueUrl: string;
  Entries: Array<{
    Id: string;
    MessageBody: string;
    MessageGroupId?: string;
    MessageDeduplicationId?: string;
    MessageAttributes?: Record<string, MessageAttributeValue>;
    DelaySeconds?: number;
  }>;
}

export interface ReceiveMessageParameters {
  QueueUrl: string;
  AttributeNames?: string[];
  MessageAttributeNames?: string[];
  MaxNumberOfMessages?: number;
  VisibilityTimeoutSeconds?: number;
  WaitTimeSeconds?: number;
}

export interface DeleteMessageParameters {
  QueueUrl: string;
  ReceiptHandle: string;
}

export interface DeleteMessageBatchParameters {
  QueueUrl: string;
  Entries: Array<{
    Id: string;
    ReceiptHandle: string;
  }>;
}

export type SQSMessage = Message;

export interface QueueAttributes {
  [key: string]: string;
}
