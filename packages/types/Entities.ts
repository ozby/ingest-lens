export interface IMessage {
  id: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
  queueId: string;
  received: boolean;
  receivedAt?: Date;
  expiresAt: Date;
  expiresAt2: Date;
  expiresAt3: Date;
  receivedCount: number;
}

export interface IQueue {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  retentionPeriod: number;
  schema?: Record<string, unknown>;
  pushEndpoint?: string;
}

export interface ITopic {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  subscribedQueues: string[];
}

export interface IUser {
  id: string;
  username: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IActivityDataPoint {
  time: string;
  requests: number;
  messages: number;
  errors: number;
}

export interface IServerMetrics {
  startTime: Date;
  totalRequests: number;
  activeConnections: number;
  messagesProcessed: number;
  errorCount: number;
  avgResponseTime: number;
  activityHistory?: IActivityDataPoint[];
}

export interface IQueueMetrics {
  queueId: string;
  messageCount: number;
  messagesSent: number;
  messagesReceived: number;
  avgWaitTime: number;
}

export interface IDecodedToken {
  userId: string;
  username: string;
  iat: number;
  exp: number;
}
