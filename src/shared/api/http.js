import axios from "axios";
import { API_BASE_URL } from "../../config/env";

export const http = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const normalized = new Error(
      error.response?.data?.message ||
        (error.code === "ECONNABORTED"
          ? "请求超时，请稍后重试"
          : "无法连接服务，请检查网络或后端服务"),
    );
    normalized.status = error.response?.status;
    normalized.fields = error.response?.data?.fields || {};
    return Promise.reject(normalized);
  },
);
