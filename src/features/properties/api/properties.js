import { http } from "../../../shared/api/http";

// Keep transport concerns out of pages and components.
export const propertyApi = {
  list: (params, signal) => http.get("/properties", { params, signal }),
  detail: (id) => http.get(`/properties/${encodeURIComponent(id)}`),
  create: (data) => http.post("/properties", data),
  update: (id, data) => http.put(`/properties/${encodeURIComponent(id)}`, data),
  remove: (id, version) =>
    http.delete(`/properties/${encodeURIComponent(id)}`, { data: { version } }),
};
