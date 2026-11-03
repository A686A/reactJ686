import { http } from "../shared/api/http";
export const purchaseApplicationApi = {
  /**
   * 查询购房申请、服务端分页及全库审批统计。
   * @param {object} params 关键词、审批状态、页码和每页数量。
   * @param {AbortSignal} signal 可选取消信号。
   * @returns {Promise<object>} 分页申请与 summary 统计。
   */
  getList: (params, signal) =>
    http.get("/purchase-applications", { params, signal }),
  /**
   * 读取申请详情、房源快照、当前版本及审批历史。
   * @param {string} id 申请 ID。
   * @returns {Promise<object>} 完整申请数据。
   */
  getById: (id) => http.get(`/purchase-applications/${encodeURIComponent(id)}`),
  /**
   * 提交通过或驳回决定，不允许调用方直接覆盖申请状态。
   * @param {string} id 申请 ID。
   * @param {object} payload decision、comment、version 和同次重试复用的 requestKey。
   * @returns {Promise<object>} 包含最新状态和历史的申请。
   */
  submitApproval: (id, payload) =>
    http.post(
      `/purchase-applications/${encodeURIComponent(id)}/approvals`,
      payload,
    ),
  /**
   * 提交已核对的购房申请，服务端重新核验房源状态与版本。
   * @param {object} payload 买方、成交信息、房源 ID/版本及 submissionKey。
   * @returns {Promise<object>} 新建申请，或同一标识重试对应的原申请。
   */
  submitApplication: (payload) => http.post("/purchase-applications", payload),
};
