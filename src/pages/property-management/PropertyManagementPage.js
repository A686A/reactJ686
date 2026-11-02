import { useRef, useState } from "react";
import { propertyApi } from "../../api/propertyApi";
import PropertyEditorDialog from "../../features/property-management/components/PropertyEditorDialog";
import PropertyDetailsDialog from "../../features/property-management/components/PropertyDetailsDialog";
import { usePropertyList } from "../../features/property-management/hooks/usePropertyList";
import {
  formatNumber,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
} from "../../features/property-management/model/propertyFormModel";
import Modal from "../../shared/components/Modal";

const statusClass = {
  在售: "green",
  已售: "blue",
  待上架: "amber",
  已下架: "gray",
};
export default function PropertyManagementPage() {
  const { query, setQuery, result, loading, error, refresh } =
    usePropertyList();
  const [filters, setFilters] = useState({ keyword: "", type: "", status: "" });
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const openLock = useRef(false);
  const [deleteError, setDeleteError] = useState("");
  const summary = result.summary;
  async function open(mode, id) {
    if (openLock.current) return;
    openLock.current = true;
    setOpening(true);
    try {
      const property = await propertyApi.getById(id);
      setDialog({ mode, property });
      setDeleteError("");
    } catch (cause) {
      setNotice({ error: true, text: cause.message });
    } finally {
      openLock.current = false;
      setOpening(false);
    }
  }
  async function save(payload, version) {
    if (dialog.mode === "edit")
      await propertyApi.update(dialog.property.id, { ...payload, version });
    else await propertyApi.create(payload);
    const created = dialog.mode === "create";
    setDialog(null);
    setNotice({
      text: created
        ? "房源新增成功，列表已刷新。"
        : "房源修改成功，列表已刷新。",
    });
    if (created)
      setQuery((previous) => ({
        ...previous,
        keyword: "",
        status: "",
        type: "",
        page: 1,
        sort: "updatedAt",
        order: "desc",
      }));
    if (created) setFilters({ keyword: "", status: "", type: "" });
    refresh();
  }
  async function remove() {
    setBusy(true);
    setDeleteError("");
    try {
      await propertyApi.delete(dialog.property.id, dialog.property.version);
      setDialog(null);
      setNotice({ text: "房源已删除。" });
      refresh();
    } catch (cause) {
      setDeleteError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  const search = (event) => {
    event.preventDefault();
    setQuery((previous) => ({
      ...previous,
      ...filters,
      keyword: filters.keyword.trim(),
      page: 1,
    }));
  };
  const reset = () => {
    setFilters({ keyword: "", type: "", status: "" });
    setQuery((previous) => ({
      ...previous,
      keyword: "",
      type: "",
      status: "",
      page: 1,
    }));
  };
  const pages = Math.max(1, Math.ceil(result.total / query.pageSize));
  return (
    <>
      <div className="breadcrumb">
        资产管理 <span>/</span> <strong>房源管理</strong>
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">PROPERTY MANAGEMENT</div>
          <h1>
            让每一处资产，清晰可见<span>。</span>
          </h1>
          <p>集中维护房源信息，掌握不动产的每一次变化。</p>
        </div>
        <button
          className="button primary"
          onClick={() => setDialog({ mode: "create" })}
        >
          ＋ 新增房源
        </button>
      </header>
      <section className="stats" aria-label="全部房源统计">
        {[
          ["房源总数", summary.total, "套", "全部已登记房源", "▦"],
          ["在售房源", summary.forSale, "套", "正在市场中流通", "↗"],
          ["已售房源", summary.sold, "套", "已完成交易的房源", "✓"],
          [
            "房源总价值",
            formatNumber(summary.totalPrice),
            "万元",
            "全部房源登记总价合计",
            "¥",
          ],
        ].map(([label, value, unit, note, icon], i) => (
          <article className="stat" key={label}>
            <div className="stat-label">
              {label}
              <span className={`stat-icon stat-icon-${i}`}>{icon}</span>
            </div>
            <div className="stat-value">
              {value}
              <small>{unit}</small>
            </div>
            <p>{note}</p>
          </article>
        ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              房源档案 <span className="count-pill">{result.total}</span>
            </h2>
            <p>高效检索、维护与管理您的房产资源</p>
          </div>
          <button
            className="button subtle"
            disabled={loading}
            onClick={refresh}
          >
            ↻ 刷新列表
          </button>
        </div>
        <form className="filters" onSubmit={search}>
          <div className="search-field">
            <label className="sr-only" htmlFor="keyword">
              搜索房源
            </label>
            <span aria-hidden="true">⌕</span>
            <input
              id="keyword"
              placeholder="搜索房源名称、编号或地址"
              value={filters.keyword}
              onChange={(e) =>
                setFilters({ ...filters, keyword: e.target.value })
              }
            />
          </div>
          <label className="sr-only" htmlFor="filter-type">
            房源类型筛选
          </label>
          <select
            id="filter-type"
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            <option value="">全部类型</option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-status">
            房源状态筛选
          </label>
          <select
            id="filter-status"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">全部状态</option>
            {PROPERTY_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <button className="button primary" disabled={loading}>
            查询
          </button>
          <button type="button" className="button" onClick={reset}>
            重置
          </button>
        </form>
        <div className="list-toolbar">
          <span>
            <i className="live-dot" />
            房源列表 <small>· 金额单位：万元</small>
          </span>
          <label>
            排序{" "}
            <select
              aria-label="排序"
              value={`${query.sort}:${query.order}`}
              onChange={(e) => {
                const [sort, order] = e.target.value.split(":");
                setQuery((previous) => ({ ...previous, sort, order, page: 1 }));
              }}
            >
              <option value="updatedAt:desc">最近更新</option>
              <option value="price:asc">总价从低到高</option>
              <option value="price:desc">总价从高到低</option>
              <option value="area:desc">面积从大到小</option>
            </select>
          </label>
        </div>
        {notice && (
          <div
            className={`alert ${notice.error ? "error" : "success"}`}
            role={notice.error ? "alert" : "status"}
          >
            {notice.text}
            <button
              className="icon-button"
              aria-label="关闭消息"
              onClick={() => setNotice(null)}
            >
              ×
            </button>
          </div>
        )}
        {error ? (
          <div className="empty" role="alert">
            <h3>房源加载失败</h3>
            <p>{error}</p>
            <button className="button" onClick={refresh}>
              重新加载
            </button>
          </div>
        ) : loading ? (
          <div className="empty" role="status">
            <div className="spinner" />
            <p>正在加载房源档案…</p>
          </div>
        ) : result.items.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⌂</div>
            <h3>暂无符合条件的房源</h3>
            <p>调整查询条件，或登记您的第一套房源。</p>
            <button className="button" onClick={reset}>
              清除筛选
            </button>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>房源信息</th>
                  <th>类型 / 户型</th>
                  <th>建筑面积</th>
                  <th>总价</th>
                  <th>状态</th>
                  <th>联系人</th>
                  <th>更新时间</th>
                  <th className="actions-col">操作</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="property-cell">
                        <span
                          className={`property-icon type-${PROPERTY_TYPES.indexOf(row.type)}`}
                          aria-hidden="true"
                        >
                          {row.type === "住宅" ? "⌂" : "▥"}
                        </span>
                        <div>
                          <button
                            className="property-name"
                            disabled={opening}
                            onClick={() => open("detail", row.id)}
                          >
                            {row.name}
                          </button>
                          <div className="property-address">
                            {row.city} · {row.district} · {row.address}
                          </div>
                          <span className="property-code">{row.code}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {row.type}
                      <small className="cell-sub">
                        {row.rooms ? `${row.rooms} 室` : "开放空间"}
                      </small>
                    </td>
                    <td>
                      {formatNumber(row.area)}
                      <small className="inline-unit">㎡</small>
                    </td>
                    <td className="price">
                      {formatNumber(row.price)}
                      <small className="inline-unit">万</small>
                    </td>
                    <td>
                      <span className={`badge ${statusClass[row.status]}`}>
                        <i />
                        {row.status}
                      </span>
                    </td>
                    <td>
                      {row.contact}
                      <small className="cell-sub">{row.phone}</small>
                    </td>
                    <td className="date">
                      {new Date(row.updatedAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          disabled={opening}
                          onClick={() => open("detail", row.id)}
                        >
                          详情
                        </button>
                        <button
                          disabled={opening}
                          onClick={() => open("edit", row.id)}
                        >
                          编辑
                        </button>
                        <button
                          className="danger-text"
                          disabled={opening}
                          onClick={() => open("delete", row.id)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="pagination">
          <span>
            {error ? "加载失败" : `共 ${result.total} 条房源`}
            <span className="desktop-note"> · 每页 </span>
            <select
              aria-label="每页条数"
              value={query.pageSize}
              onChange={(e) =>
                setQuery((previous) => ({
                  ...previous,
                  pageSize: Number(e.target.value),
                  page: 1,
                }))
              }
            >
              {[8, 16, 32].map((size) => (
                <option value={size} key={size}>
                  {size} 条
                </option>
              ))}
            </select>
          </span>
          <div>
            <button
              className="button page-button"
              aria-label="上一页"
              disabled={loading || !!error || query.page <= 1}
              onClick={() =>
                setQuery((previous) => ({
                  ...previous,
                  page: previous.page - 1,
                }))
              }
            >
              ‹
            </button>
            <span className="page-current">{query.page}</span>
            <span className="page-total"> / {pages}</span>
            <button
              className="button page-button"
              aria-label="下一页"
              disabled={loading || !!error || query.page >= pages}
              onClick={() =>
                setQuery((previous) => ({
                  ...previous,
                  page: previous.page + 1,
                }))
              }
            >
              ›
            </button>
          </div>
        </footer>
      </section>
      <div className="page-note">
        <span>◈ 栖境资产管理工作台</span>
        <span>开发环境 · 独立模拟 API · 数据仅供演示</span>
      </div>
      {dialog && ["create", "edit"].includes(dialog.mode) && (
        <PropertyEditorDialog
          property={dialog.property}
          onClose={() => setDialog(null)}
          onSubmit={save}
        />
      )}
      {dialog?.mode === "detail" && (
        <PropertyDetailsDialog
          property={dialog.property}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.mode === "delete" && (
        <Modal title="确认删除房源" busy={busy} onClose={() => setDialog(null)}>
          <div className="delete-warning">!</div>
          <p>
            确定删除「<strong>{dialog.property.name}</strong>」吗？
          </p>
          <p className="muted">删除后无法恢复，请确认该房源不再需要保留。</p>
          {deleteError && (
            <div className="alert error" role="alert">
              {deleteError}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              取消
            </button>
            <button className="button danger" disabled={busy} onClick={remove}>
              {busy ? "删除中…" : "确认删除"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
