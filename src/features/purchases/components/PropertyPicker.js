import { useEffect, useState } from "react";
import { propertyApi } from "../../properties/api/properties";
import { formatNumber } from "../../properties/model/property";

export default function PropertyPicker({
  selected,
  onSelect,
  disabled,
  error,
}) {
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    const timer = setTimeout(async () => {
      try {
        const data = await propertyApi.list(
          {
            status: "在售",
            keyword,
            page,
            pageSize: 4,
            sort: "updatedAt",
            order: "desc",
          },
          controller.signal,
        );
        if (!controller.signal.aborted) setResult(data);
      } catch (cause) {
        if (!controller.signal.aborted) setMessage(cause.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [keyword, page, revision]);
  return (
    <section className="property-picker" aria-label="选择在售房源">
      <label htmlFor="purchase-property-search">
        选择房源 <span className="required">*</span>
      </label>
      <input
        id="purchase-property-search"
        placeholder="按名称、编号或地址搜索在售房源"
        value={keyword}
        disabled={disabled}
        onChange={(e) => {
          setKeyword(e.target.value);
          setPage(1);
        }}
      />
      {selected && (
        <div className="selected-property">
          <strong>已选：{selected.name}</strong>
          <span>
            {selected.code} · 挂牌价 {formatNumber(selected.price)} 万元
          </span>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="muted" role="status">
          正在查询在售房源…
        </p>
      ) : message ? (
        <div className="alert error" role="alert">
          {message}
          <button
            type="button"
            className="button"
            onClick={() => setRevision((n) => n + 1)}
          >
            重试房源查询
          </button>
        </div>
      ) : result.items.length === 0 ? (
        <p className="muted">
          暂无匹配的在售房源，请调整条件或先在房源管理中登记。
        </p>
      ) : (
        <div className="property-options">
          {result.items.map((row) => (
            <label
              className={`property-option ${selected?.id === row.id ? "selected" : ""}`}
              key={row.id}
            >
              <input
                type="radio"
                name="purchase-property"
                checked={selected?.id === row.id}
                disabled={disabled}
                onChange={() => onSelect(row)}
              />
              <div>
                <strong>{row.name}</strong>
                <small>
                  {row.code} · {row.city} · {row.district} ·{" "}
                  {formatNumber(row.area)} ㎡
                </small>
              </div>
              <span>{formatNumber(row.price)} 万</span>
            </label>
          ))}
        </div>
      )}
      <div className="picker-pagination">
        <small className="muted">仅显示在售房源，共 {result.total} 套</small>
        <div>
          <button
            type="button"
            className="button"
            disabled={disabled || loading || page === 1}
            onClick={() => setPage((n) => n - 1)}
          >
            上一组
          </button>
          <span>{page}</span>
          <button
            type="button"
            className="button"
            disabled={disabled || loading || page * 4 >= result.total}
            onClick={() => setPage((n) => n + 1)}
          >
            下一组
          </button>
        </div>
      </div>
    </section>
  );
}
