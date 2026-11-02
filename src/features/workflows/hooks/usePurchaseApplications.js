import { useCallback, useEffect, useState } from "react";
import { purchaseWorkflowApi } from "../api/purchaseWorkflow";
export function usePurchaseApplications() {
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
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      try {
        const data = await purchaseWorkflowApi.list(query, controller.signal);
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
