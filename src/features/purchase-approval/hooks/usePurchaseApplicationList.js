import { useCallback, useEffect, useState } from "react";
import { purchaseApplicationApi } from "../../../api/purchaseApplicationApi";
/**
 * 管理购房申请的关键词、审核状态、分页和异步加载结果。
 * 通过取消请求避免旧响应覆盖新条件，支持保持条件不变的刷新。
 * @returns {object} 查询条件、列表与统计、状态及刷新方法。
 */
export function usePurchaseApplicationList() {
  const [query, setQuery] = useState({
    keyword: "",
    status: "",
    page: 1,
    pageSize: 8,
  });
  const [result, setResult] = useState({
    items: [],
    total: 0,
    summary: { pending: 0, approved: 0, rejected: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  /** 触发重新查询，用于提交申请或审批完成后同步列表和统计。 */
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  /** 查询条件或刷新标记变化时加载数据；清理时取消，防止过期响应更新页面。 */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    /**
     * 查询本轮申请列表；取消后忽略响应和错误。
     * 审核使筛选结果减少时，自动修正已超出的页码。
     */
    async function load() {
      try {
        const data = await purchaseApplicationApi.getList(
          query,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          if (query.page > 1 && data.items.length === 0)
            setQuery((previous) => ({
              ...previous,
              page: Math.max(1, Math.ceil(data.total / previous.pageSize)),
            }));
          else setResult(data);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [query, revision]);
  return { query, setQuery, result, loading, error, refresh };
}
