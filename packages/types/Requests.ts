export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  password: string;
  email: string;
}

export interface CreateQueueRequest {
  name: string;
  retentionPeriod?: number;
  schema?: Record<string, unknown>;
  pushEndpoint?: string;
}

export interface CreateTopicRequest {
  name: string;
  subscribedQueues?: string[];
}

export interface SubscribeTopicRequest {
  queueId: string;
}

export interface PublishTopicRequest {
  data: unknown;
}

export interface SendMessageRequest {
  data: unknown;
}

export interface ReceiveMessagesQuery {
  maxMessages?: number;
  visibilityTimeout?: number;
}

// URL Parameters
export interface QueueParams {
  id: string;
}

export interface DeleteTopicParams {
  id: string;
}

export interface TopicSubscriptionParams {
  topicId: string;
}

export interface TopicPublishParams {
  topicId: string;
}

export interface MessageSendParams {
  queueId: string;
}

export interface MessageReceiveParams {
  queueId: string;
}

export interface MessageActionParams {
  queueId: string;
  messageId: string;
}
