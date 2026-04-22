import { IUser } from "./Entities";

export interface AuthResponse {
  token: string;
  user: IUser;
}

export interface ApiResponse<T> {
  status: string;
  data: T;
}
