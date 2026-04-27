export type ApiSuccess<T> = {
  status: "success";
  results?: number;
  data: T;
};

export type ApiError = {
  status: "error";
  message: string;
};

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
};

export type AuthResponse = ApiSuccess<{
  token: string;
  user: AuthUser;
}>;
