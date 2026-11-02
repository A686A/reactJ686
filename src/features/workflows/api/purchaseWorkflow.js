import { http } from "../../../shared/api/http";
export const purchaseWorkflowApi = {
  list: (params, signal) =>
    http.get("/purchase-applications", { params, signal }),
  detail: (id) => http.get(`/purchase-applications/${encodeURIComponent(id)}`),
  review: (id, payload) =>
    http.post(
      `/purchase-applications/${encodeURIComponent(id)}/reviews`,
      payload,
    ),
  submit: (payload) => http.post("/purchase-applications", payload),
};
