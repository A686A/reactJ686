import { useCallback, useEffect, useRef, useState } from "react";
import { propertyApi } from "../api/properties";

export function useProperties() {
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
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    async function load() {
      try {
        const data = await propertyApi.list(query, controller.signal);
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
