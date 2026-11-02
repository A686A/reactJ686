import { useCallback, useEffect, useState } from "react";
import { purchaseApi } from "../api/purchases";
export function usePurchaseApplications() {
  const [query, setQuery] = useState({ keyword: "", page: 1, pageSize: 8 });
  const [result, setResult] = useState({ items: [], total: 0 });
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
        const data = await purchaseApi.list(query, controller.signal);
        if (!controller.signal.aborted) setResult(data);
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
