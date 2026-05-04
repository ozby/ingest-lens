import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import {
  ApiResponse,
  CreateIntakeSuggestionRequest,
  DeleteMessageData,
  MessageData,
  QueueMetricsData,
  QueueMetricsListData,
  ReceiveMessagesData,
  ServerActivityHistoryData,
  ServerMetricsData,
  CreateQueueRequest,
  CreateTopicRequest,
  IActivityDataPoint,
  IMessage,
  IQueue,
  IQueueMetrics,
  IServerMetrics,
  ITopic,
  PublishTopicRequest,
  ReceiveMessagesQuery,
  SendMessageRequest,
  ApproveIntakeSuggestionRequest,
  RejectIntakeSuggestionRequest,
  SubscribeTopicRequest,
  IntakeAttemptData,
  IntakeAttemptListData,
  IntakeApprovalData,
} from "@repo/types";
import { toast } from "sonner";

interface PublicFixtureMetadata {
  id: string;
  sourceSystem: string;
  sourceUrl: string;
  summary: string;
  contractHint?: string;
}

interface PublicFixtureDetail {
  id: string;
  sourceSystem: string;
  sourceUrl: string;
  payload: Record<string, unknown>;
  contractHint?: string;
}

export function extractData<T>(response: AxiosResponse<ApiResponse<T>>): T {
  const envelope = response.data;
  if (!envelope) {
    throw new Error("API response envelope is missing");
  }
  if (envelope.status !== "success") {
    throw new Error(`API response envelope status is "${envelope.status}", expected "success"`);
  }
  return envelope.data;
}

class ApiService {
  private api: ReturnType<typeof axios.create>;

  constructor() {
    const apiUrl = import.meta.env.VITE_API_BASE_URL;
    this.api = axios.create({
      baseURL: apiUrl,
      headers: {
        "Content-Type": "application/json",
      },
      // BetterAuth uses session cookies — withCredentials ensures cookies are sent cross-origin
      withCredentials: true,
    });

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        const errorMessage = error.response?.data?.message || "An error occurred";
        toast.error(errorMessage);
        return Promise.reject(error);
      },
    );
  }

  async getServerMetrics(): Promise<IServerMetrics> {
    const response = await this.api.get<ApiResponse<ServerMetricsData>>("/api/dashboard/server");
    return extractData(response).serverMetrics;
  }

  async getServerActivityHistory(): Promise<IActivityDataPoint[]> {
    const response = await this.api.get<ApiResponse<ServerActivityHistoryData>>(
      "/api/dashboard/server/activity",
    );
    return extractData(response).activityHistory;
  }

  async getAllQueueMetrics(): Promise<IQueueMetrics[]> {
    const response = await this.api.get<ApiResponse<QueueMetricsListData>>("/api/dashboard/queues");
    return extractData(response).queueMetrics;
  }

  async getQueueMetrics(queueId: string): Promise<IQueueMetrics> {
    const response = await this.api.get<ApiResponse<QueueMetricsData>>(
      `/api/dashboard/queues/${queueId}`,
    );
    return extractData(response).queueMetrics;
  }

  async createQueue(queue: CreateQueueRequest): Promise<IQueue> {
    const response = await this.api.post<ApiResponse<{ queue: IQueue }>>("/api/queues", queue);
    return extractData(response).queue;
  }

  async getQueues(): Promise<IQueue[]> {
    const response = await this.api.get<ApiResponse<{ queues: IQueue[] }>>("/api/queues");
    return extractData(response).queues;
  }

  async getQueue(id: string): Promise<IQueue> {
    const response = await this.api.get<ApiResponse<{ queue: IQueue }>>(`/api/queues/${id}`);
    return extractData(response).queue;
  }

  async deleteQueue(id: string): Promise<void> {
    await this.api.delete(`/api/queues/${id}`);
  }

  async createTopic(topic: CreateTopicRequest): Promise<ITopic> {
    const response = await this.api.post<ApiResponse<{ topic: ITopic }>>("/api/topics", topic);
    return extractData(response).topic;
  }

  async getTopics(): Promise<ITopic[]> {
    const response = await this.api.get<ApiResponse<{ topics: ITopic[] }>>("/api/topics");
    return extractData(response).topics;
  }

  async getTopic(id: string): Promise<ITopic> {
    const response = await this.api.get<ApiResponse<{ topic: ITopic }>>(`/api/topics/${id}`);
    return extractData(response).topic;
  }

  async deleteTopic(id: string): Promise<void> {
    await this.api.delete(`/api/topics/${id}`);
  }

  async subscribeTopic(topicId: string, request: SubscribeTopicRequest): Promise<ITopic> {
    const response = await this.api.post<ApiResponse<{ topic: ITopic }>>(
      `/api/topics/${topicId}/subscribe`,
      request,
    );
    return extractData(response).topic;
  }

  async publishToTopic(topicId: string, request: PublishTopicRequest): Promise<void> {
    await this.api.post(`/api/topics/${topicId}/publish`, request);
  }

  async sendMessage(queueId: string, request: SendMessageRequest): Promise<IMessage> {
    const response = await this.api.post<ApiResponse<MessageData>>(
      `/api/messages/${queueId}`,
      request,
    );
    return extractData(response).message;
  }

  async receiveMessages(queueId: string, query?: ReceiveMessagesQuery): Promise<IMessage[]> {
    const config: AxiosRequestConfig = {};
    if (query) {
      config.params = query;
    }
    const response = await this.api.get<ApiResponse<ReceiveMessagesData>>(
      `/api/messages/${queueId}`,
      config,
    );
    return extractData(response).messages;
  }

  async getMessage(queueId: string, messageId: string): Promise<IMessage> {
    const response = await this.api.get<ApiResponse<MessageData>>(
      `/api/messages/${queueId}/${messageId}`,
    );
    return extractData(response).message;
  }

  async createIntakeSuggestion(
    request: CreateIntakeSuggestionRequest,
  ): Promise<IntakeAttemptData["attempt"]> {
    const response = await this.api.post<ApiResponse<IntakeAttemptData>>(
      "/api/intake/mapping-suggestions",
      request,
    );
    return extractData(response).attempt;
  }

  async getIntakeSuggestions(status?: string): Promise<IntakeAttemptData["attempt"][]> {
    const response = await this.api.get<ApiResponse<IntakeAttemptListData>>(
      "/api/intake/mapping-suggestions",
      {
        params: status ? { status } : undefined,
      },
    );
    return extractData(response).attempts;
  }

  async getPublicFixtures(): Promise<PublicFixtureMetadata[]> {
    const response = await this.api.get<ApiResponse<{ fixtures: PublicFixtureMetadata[] }>>(
      "/api/intake/public-fixtures",
    );
    return extractData(response).fixtures;
  }

  async getPublicFixtureById(fixtureId: string): Promise<PublicFixtureDetail> {
    const response = await this.api.get<ApiResponse<{ fixture: PublicFixtureDetail }>>(
      `/api/intake/public-fixtures/${fixtureId}`,
    );
    return extractData(response).fixture;
  }

  async approveIntakeSuggestion(
    attemptId: string,
    request: ApproveIntakeSuggestionRequest = {},
  ): Promise<IntakeApprovalData> {
    const response = await this.api.post<ApiResponse<IntakeApprovalData>>(
      `/api/intake/mapping-suggestions/${attemptId}/approve`,
      request,
    );
    return extractData(response);
  }

  async rejectIntakeSuggestion(
    attemptId: string,
    request: RejectIntakeSuggestionRequest,
  ): Promise<IntakeAttemptData["attempt"]> {
    const response = await this.api.post<ApiResponse<IntakeAttemptData>>(
      `/api/intake/mapping-suggestions/${attemptId}/reject`,
      request,
    );
    return extractData(response).attempt;
  }

  async deleteMessage(queueId: string, messageId: string): Promise<string> {
    const response = await this.api.delete<ApiResponse<DeleteMessageData>>(
      `/api/messages/${queueId}/${messageId}`,
    );
    return extractData(response).deletedMessageId;
  }
}

const apiService = new ApiService();

export default apiService;
