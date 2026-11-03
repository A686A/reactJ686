import { http } from "../shared/api/http";

// Keep transport concerns out of pages and components.
export const propertyApi = {
  /**
   * 查询房源列表、服务端分页和统计。
   * @param {object} params 关键词、类型、状态、页码、每页数量及排序。
   * @param {AbortSignal} signal 可选的取消信号，切换查询时终止旧请求。
   * @returns {Promise<object>} 包含 items、total、page、pageSize 和 summary 的结果。
   */
  getList: (params, signal) => http.get("/properties", { params, signal }),
  /**
   * 读取单个房源的最新详情及版本，供详情、编辑或删除确认使用。
   * @param {string} id 房源 ID，编码后写入路径。
   * @returns {Promise<object>} 完整房源数据。
   */
  getById: (id) => http.get(`/properties/${encodeURIComponent(id)}`),
  /**
   * 新增房源，系统编号、ID 和初始版本由后端生成。
   * @param {object} data 经表单转换的房源业务字段。
   * @returns {Promise<object>} 新增后的完整房源。
   */
  create: (data) => http.post("/properties", data),
  /**
   * 全量更新房源业务字段，后端根据 data.version 拒绝过期修改。
   * @param {string} id 房源 ID。
   * @param {object} data 业务字段及读取时的版本。
   * @returns {Promise<object>} 更新后的房源及新版本。
   */
  update: (id, data) => http.put(`/properties/${encodeURIComponent(id)}`, data),
  /**
   * 按 ID 删除房源，并在请求体携带版本以防误删已更新的记录。
   * @param {string} id 房源 ID。
   * @param {number} version 用户确认删除时的版本。
   * @returns {Promise<unknown>} 后端返回 204，无业务数据。
   */
  delete: (id, version) =>
    http.delete(`/properties/${encodeURIComponent(id)}`, { data: { version } }),
};
