import { http } from "../shared/api/http";
export const purchaseApplicationApi = {
  getList: (params, signal) =>
    http.get("/purchase-applications", { params, signal }),
  getById: (id) => http.get(`/purchase-applications/${encodeURIComponent(id)}`),
  submitApproval: (id, payload) =>
    http.post(
      `/purchase-applications/${encodeURIComponent(id)}/approvals`,
      payload,
    ),
  submitApplication: (payload) => http.post("/purchase-applications", payload),
};
