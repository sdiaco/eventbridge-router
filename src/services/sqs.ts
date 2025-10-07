import sqsService from '../lib/sqs';
import type {
  SendMessageParameters,
  SendMessageBatchParameters,
  ReceiveMessageParameters,
  DeleteMessageParameters,
  DeleteMessageBatchParameters,
  SQSMessage,
  QueueAttributes,
} from '../types/sqs';

const {
  sqs,
  commands: {
    SendMessageCommand,
    SendMessageBatchCommand,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    DeleteMessageBatchCommand,
    GetQueueAttributesCommand,
  },
} = sqsService;

const sendMessage = async (params: SendMessageParameters): Promise<string | undefined> => {
  try {
    if (!params.QueueUrl) {
      throw new Error('QueueUrl is required');
    }

    if (!params.MessageBody) {
      throw new Error('MessageBody is required');
    }

    const command = new SendMessageCommand({
      QueueUrl: params.QueueUrl,
      MessageBody: params.MessageBody,
      MessageGroupId: params.MessageGroupId,
      MessageDeduplicationId: params.MessageDeduplicationId,
      MessageAttributes: params.MessageAttributes,
      DelaySeconds: params.DelaySeconds,
    });

    const result = await sqs.send(command);
    return result.MessageId;
  } catch (error) {
    throw new Error(`Error sending message to SQS: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const sendMessageBatch = async (params: SendMessageBatchParameters): Promise<void> => {
  try {
    if (!params.QueueUrl) {
      throw new Error('QueueUrl is required');
    }

    if (!params.Entries || params.Entries.length === 0) {
      throw new Error('Entries are required');
    }

    const command = new SendMessageBatchCommand({
      QueueUrl: params.QueueUrl,
      Entries: params.Entries,
    });

    const result = await sqs.send(command);

    if (result.Failed && result.Failed.length > 0) {
      throw new Error(
        `Failed to send ${result.Failed.length} messages: ${result.Failed.map((f) => f.Message).join(', ')}`
      );
    }
  } catch (error) {
    throw new Error(`Error sending batch messages to SQS: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const receiveMessages = async (params: ReceiveMessageParameters): Promise<SQSMessage[]> => {
  try {
    if (!params.QueueUrl) {
      throw new Error('QueueUrl is required');
    }

    const command = new ReceiveMessageCommand({
      QueueUrl: params.QueueUrl,
      AttributeNames: params.AttributeNames,
      MessageAttributeNames: params.MessageAttributeNames,
      MaxNumberOfMessages: params.MaxNumberOfMessages || 1,
      VisibilityTimeout: params.VisibilityTimeoutSeconds,
      WaitTimeSeconds: params.WaitTimeSeconds || 0,
    });

    const result = await sqs.send(command);
    return (result.Messages as SQSMessage[]) || [];
  } catch (error) {
    throw new Error(`Error receiving messages from SQS: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const deleteMessage = async (params: DeleteMessageParameters): Promise<void> => {
  try {
    if (!params.QueueUrl) {
      throw new Error('QueueUrl is required');
    }

    if (!params.ReceiptHandle) {
      throw new Error('ReceiptHandle is required');
    }

    const command = new DeleteMessageCommand({
      QueueUrl: params.QueueUrl,
      ReceiptHandle: params.ReceiptHandle,
    });

    await sqs.send(command);
  } catch (error) {
    throw new Error(`Error deleting message from SQS: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const deleteMessageBatch = async (params: DeleteMessageBatchParameters): Promise<void> => {
  try {
    if (!params.QueueUrl) {
      throw new Error('QueueUrl is required');
    }

    if (!params.Entries || params.Entries.length === 0) {
      throw new Error('Entries are required');
    }

    const command = new DeleteMessageBatchCommand({
      QueueUrl: params.QueueUrl,
      Entries: params.Entries,
    });

    const result = await sqs.send(command);

    if (result.Failed && result.Failed.length > 0) {
      throw new Error(
        `Failed to delete ${result.Failed.length} messages: ${result.Failed.map((f) => f.Message).join(', ')}`
      );
    }
  } catch (error) {
    throw new Error(`Error deleting batch messages from SQS: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const getQueueAttributes = async (queueUrl: string): Promise<QueueAttributes> => {
  try {
    if (!queueUrl) {
      throw new Error('QueueUrl is required');
    }

    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['All'],
    });

    const result = await sqs.send(command);
    return (result.Attributes as QueueAttributes) || {};
  } catch (error) {
    throw new Error(`Error getting queue attributes from SQS: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export { sendMessage, sendMessageBatch, receiveMessages, deleteMessage, deleteMessageBatch, getQueueAttributes };
