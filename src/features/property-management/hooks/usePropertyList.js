import { useCallback, useEffect, useRef, useState } from "react";
import { propertyApi } from "../../../api/propertyApi";

/**
 * 管理房源筛选、分页、统计、加载状态和手动刷新。
 * 取消失效请求，并通过请求序号避免旧结果覆盖新查询。
 * @returns {object} 查询条件、结果、状态及刷新方法。
 */
export function usePropertyList() {
  const [query, setQuery] = useState({
    keyword: "",
    status: "",
    type: "",
    page: 1,
    pageSize: 8,
    sort: "updatedAt",
    order: "desc",
  });
  const [result, setResult] = useState({
    items: [],
    total: 0,
    summary: { total: 0, forSale: 0, sold: 0, totalPrice: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  /** 增加刷新标记，在筛选条件不变时重新从后端获取房源。 */
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  /** 为当前查询创建独立取消信号与请求序号；条件变化或卸载时取消本轮请求。 */
  useEffect(() => {
    const controller = new AbortController();
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    /**
     * 执行本轮房源查询，只接受尚未失效的响应。
     * 删除末页最后一条后，将页码调整到仍存在的最后一页并触发重查。
     */
    async function load() {
      try {
        const data = await propertyApi.getList(query, controller.signal);
        if (controller.signal.aborted || current !== sequence.current) return;
        if (query.page > 1 && data.items.length === 0) {
          setQuery((previous) => ({
            ...previous,
            page: Math.max(1, Math.ceil(data.total / previous.pageSize)),
          }));
        } else setResult(data);
      } catch (cause) {
        if (!controller.signal.aborted && current === sequence.current)
          setError(cause.message);
      } finally {
        if (!controller.signal.aborted && current === sequence.current)
          setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [query, revision]);

  return { query, setQuery, result, loading, error, refresh };
}
