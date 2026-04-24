import type {
  IActivityDataPoint,
  IMessage,
  IQueueMetrics,
  IServerMetrics,
  IUser,
} from "./Entities";
import type {
  IntakeAttemptRecord,
  ApprovedMappingRevision,
  NormalizedRecordEnvelope,
} from "./IntakeMapping";

export interface AuthResponse {
  token: string;
  user: IUser;
}

export interface ApiResponse<T> {
  status: string;
  data: T;
}

export interface CurrentUserData {
  user: IUser;
}

export interface ServerMetricsStats {
  totalQueues: number;
  totalMessages: number;
  activeMessages: number;
}

export interface ServerMetricsData {
  serverMetrics: IServerMetrics;
  stats: ServerMetricsStats;
}

export interface ServerActivityHistoryData {
  activityHistory: IActivityDataPoint[];
}

export interface QueueMetricsStats {
  totalMessages: number;
  activeMessages: number;
  oldestMessageAge: number;
}

export interface QueueMetricsListData {
  queueMetrics: IQueueMetrics[];
}

export interface QueueMetricsData {
  queueMetrics: IQueueMetrics;
  stats: QueueMetricsStats;
}

export interface MessageData {
  message: IMessage;
}

export interface ReceiveMessagesData {
  messages: IMessage[];
  visibilityTimeout: number;
}

export interface DeleteMessageData {
  deletedMessageId: string;
}

export interface IntakeAttemptData {
  attempt: IntakeAttemptRecord;
}

export interface IntakeAttemptListData {
  attempts: IntakeAttemptRecord[];
}

export interface IntakeApprovalData {
  attempt: IntakeAttemptRecord;
  mappingVersion: ApprovedMappingRevision;
  normalizedRecord?: NormalizedRecordEnvelope;
}
