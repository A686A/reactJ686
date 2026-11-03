import axios from "axios";
import { API_BASE_URL } from "../../config/env";

export const http = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

// 成功响应只向业务层暴露 data；调用方无需反复解析 Axios 外层结构。
http.interceptors.response.use(
  (response) => response.data,
  // 将超时、连接失败和服务端错误统一为 Error，同时保留状态码及字段错误。
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
