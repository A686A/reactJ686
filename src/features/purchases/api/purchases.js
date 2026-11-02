import { http } from "../../../shared/api/http";
export const purchaseApi = {
  list: (params, signal) =>
    http.get("/purchase-applications", { params, signal }),
  detail: (id) => http.get(`/purchase-applications/${encodeURIComponent(id)}`),
  submit: (payload) => http.post("/purchase-applications", payload),
};
