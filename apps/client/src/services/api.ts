import axios, { AxiosRequestConfig } from "axios";
import {
  AuthResponse,
  CreateQueueRequest,
  CreateTopicRequest,
  IActivityDataPoint,
  IMessage,
  IQueue,
  IQueueMetrics,
  IServerMetrics,
  ITopic,
  IUser,
  LoginCredentials,
  PublishTopicRequest,
  ReceiveMessagesQuery,
  RegisterCredentials,
  SendMessageRequest,
  SubscribeTopicRequest,
} from "@repo/types";
import { toast } from "sonner";

// Define types for API responses
interface ApiResponse<T> {
  status: string;
  data: T;
}

class ApiService {
  private api: ReturnType<typeof axios.create>;
  private token: string | null = null;

  constructor() {
    const apiUrl = import.meta.env.API_URL;
    console.log("apiUrl", apiUrl);
    this.api = axios.create({
      baseURL: apiUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.api.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        const errorMessage = error.response?.data?.message || "An error occurred";
        toast.error(errorMessage);
        return Promise.reject(error);
      },
    );

    this.token = localStorage.getItem("authToken");
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await this.api.post<ApiResponse<AuthResponse>>("/api/auth/login", credentials);
    this.setToken(response.data.data.token);
    return response.data.data;
  }

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const response = await this.api.post<ApiResponse<AuthResponse>>(
      "/api/auth/register",
      credentials,
    );
    this.setToken(response.data.data.token);
    return response.data.data;
  }

  async getCurrentUser(): Promise<IUser> {
    const response = await this.api.get<ApiResponse<{ user: IUser }>>("/api/auth/me");
    return response.data.data.user;
  }

  setToken(token: string): void {
    this.token = token;
    localStorage.setItem("authToken", token);
  }

  clearToken(): void {
    this.token = null;
    localStorage.removeItem("authToken");
  }

  async getServerMetrics(): Promise<IServerMetrics> {
    const response =
      await this.api.get<ApiResponse<{ serverMetrics: IServerMetrics }>>("/api/dashboard/server");
    return response.data.data.serverMetrics;
  }

  async getServerActivityHistory(): Promise<IActivityDataPoint[]> {
    const response = await this.api.get<ApiResponse<{ activityHistory: IActivityDataPoint[] }>>(
      "/api/dashboard/server/activity",
    );
    return response.data.data.activityHistory;
  }

  async getAllQueueMetrics(): Promise<IQueueMetrics[]> {
    const response =
      await this.api.get<ApiResponse<{ queueMetrics: IQueueMetrics[] }>>("/api/dashboard/queues");
    return response.data.data.queueMetrics;
  }

  async getQueueMetrics(queueId: string): Promise<IQueueMetrics> {
    const response = await this.api.get<ApiResponse<{ queueMetric: IQueueMetrics }>>(
      `/api/dashboard/queues/${queueId}`,
    );
    return response.data.data.queueMetric;
  }

  async createQueue(queue: CreateQueueRequest): Promise<IQueue> {
    const response = await this.api.post<ApiResponse<{ queue: IQueue }>>("/api/queues", queue);
    return response.data.data.queue;
  }

  async getQueues(): Promise<IQueue[]> {
    const response = await this.api.get<ApiResponse<{ queues: IQueue[] }>>("/api/queues");
    return response.data.data.queues;
  }

  async getQueue(id: string): Promise<IQueue> {
    const response = await this.api.get<ApiResponse<{ queue: IQueue }>>(`/api/queues/${id}`);
    return response.data.data.queue;
  }

  async deleteQueue(id: string): Promise<void> {
    await this.api.delete(`/api/queues/${id}`);
  }

  async createTopic(topic: CreateTopicRequest): Promise<ITopic> {
    const response = await this.api.post<ApiResponse<{ topic: ITopic }>>("/api/topics", topic);
    return response.data.data.topic;
  }

  async getTopics(): Promise<ITopic[]> {
    const response = await this.api.get<ApiResponse<{ topics: ITopic[] }>>("/api/topics");
    return response.data.data.topics;
  }

  async getTopic(id: string): Promise<ITopic> {
    const response = await this.api.get<ApiResponse<{ topic: ITopic }>>(`/api/topics/${id}`);
    return response.data.data.topic;
  }

  async deleteTopic(id: string): Promise<void> {
    await this.api.delete(`/api/topics/${id}`);
  }

  async subscribeTopic(topicId: string, request: SubscribeTopicRequest): Promise<ITopic> {
    const response = await this.api.post<ApiResponse<{ topic: ITopic }>>(
      `/api/topics/${topicId}/subscribe`,
      request,
    );
    return response.data.data.topic;
  }

  async publishToTopic(topicId: string, request: PublishTopicRequest): Promise<void> {
    await this.api.post(`/api/topics/${topicId}/publish`, request);
  }

  async sendMessage(queueId: string, request: SendMessageRequest): Promise<IMessage> {
    const response = await this.api.post<ApiResponse<{ message: IMessage }>>(
      `/api/messages/${queueId}`,
      request,
    );
    return response.data.data.message;
  }

  async receiveMessages(queueId: string, query?: ReceiveMessagesQuery): Promise<IMessage[]> {
    const config: AxiosRequestConfig = {};
    if (query) {
      config.params = query;
    }
    const response = await this.api.get<ApiResponse<{ messages: IMessage[] }>>(
      `/api/messages/${queueId}`,
      config,
    );
    return response.data.data.messages;
  }

  async getMessage(queueId: string, messageId: string): Promise<IMessage> {
    const response = await this.api.get<ApiResponse<{ message: IMessage }>>(
      `/api/messages/${queueId}/${messageId}`,
    );
    return response.data.data.message;
  }

  async deleteMessage(queueId: string, messageId: string): Promise<void> {
    await this.api.delete(`/api/messages/${queueId}/${messageId}`);
  }
}

const apiService = new ApiService();

export default apiService;
