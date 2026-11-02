import { useRef, useState } from "react";
import { purchaseApi } from "../../features/purchases/api/purchases";
import PurchaseForm from "../../features/purchases/components/PurchaseForm";
import PurchaseSummary from "../../features/purchases/components/PurchaseSummary";
import { usePurchaseApplications } from "../../features/purchases/hooks/usePurchaseApplications";
import { formatNumber } from "../../features/properties/model/property";
import Modal from "../../shared/components/Modal";
export default function PurchaseApplicationsPage() {
  const { query, setQuery, result, loading, error, refresh } =
    usePurchaseApplications();
  const [keyword, setKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);
  const [notice, setNotice] = useState("");
  const [detailError, setDetailError] = useState("");
  const [opening, setOpening] = useState(false);
  const lock = useRef(false);
  async function openDetail(id) {
    if (lock.current) return;
    lock.current = true;
    setOpening(true);
    setDetailError("");
    try {
      setDetail(await purchaseApi.detail(id));
    } catch (cause) {
      setDetailError(cause.message);
    } finally {
      lock.current = false;
      setOpening(false);
    }
  }
  function submitted(application) {
    setCreating(false);
    setKeyword("");
    setQuery((previous) => ({ ...previous, keyword: "", page: 1 }));
    refresh();
    setNotice(`购房申请已提交，申请编号：${application.code}`);
  }
  return (
    <>
      <div className="breadcrumb">
        交易管理 <span>/</span>
        <strong>购房申请</strong>
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">PURCHASE APPLICATIONS</div>
          <h1>
            从一份申请，开启安家旅程<span>。</span>
          </h1>
          <p>关联真实房源，登记成交意向，完整留存每一次购房申请。</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          ＋ 发起购房申请
        </button>
      </header>
      <section className="workflow-banner">
        <strong>当前办理环节：购房申请</strong>
        <p>选择在售房源 → 填写买方与成交信息 → 核对并确认提交</p>
        <small>
          提交后状态为“已提交”，不会自动售出或锁定房源；审批、签约与过户尚未启用。
        </small>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              申请档案 <span className="count-pill">{result.total}</span>
            </h2>
            <p>提交时的房源资料快照保留，后续房源变化不影响历史记录</p>
          </div>
          <button
            className="button subtle"
            disabled={loading}
            onClick={refresh}
          >
            ↻ 刷新列表
          </button>
        </div>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery((previous) => ({
              ...previous,
              keyword: keyword.trim(),
              page: 1,
            }));
          }}
        >
          <div className="search-field">
            <label className="sr-only" htmlFor="application-search">
              搜索购房申请
            </label>
            <input
              id="application-search"
              placeholder="搜索申请编号、买方或房源"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <button className="button primary" disabled={loading}>
            查询
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setKeyword("");
              setQuery((previous) => ({ ...previous, keyword: "", page: 1 }));
            }}
          >
            重置
          </button>
        </form>
        {notice && (
          <div className="alert success" role="status">
            {notice}
            <button
              className="icon-button"
              aria-label="关闭消息"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {detailError && (
          <div className="alert error" role="alert">
            {detailError}
          </div>
        )}
        {error ? (
          <div className="empty" role="alert">
            <h3>申请加载失败</h3>
            <p>{error}</p>
            <button className="button" onClick={refresh}>
              重新加载
            </button>
          </div>
        ) : loading ? (
          <div className="empty" role="status">
            <div className="spinner" />
            <p>正在加载申请档案…</p>
          </div>
        ) : result.items.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⌂</div>
            <h3>暂无购房申请</h3>
            <p>发起申请时需选择房源并填写成交信息。</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>申请 / 房源</th>
                  <th>买方</th>
                  <th>成交总价</th>
                  <th>意向定金</th>
                  <th>付款方式</th>
                  <th>状态</th>
                  <th>提交时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.propertySnapshot.name}</strong>
                      <small className="cell-sub">
                        {row.code} · {row.propertySnapshot.code}
                      </small>
                    </td>
                    <td>
                      {row.buyerName}
                      <small className="cell-sub">{row.buyerPhone}</small>
                    </td>
                    <td className="price">
                      {formatNumber(row.dealPrice)}
                      <small className="inline-unit">万</small>
                    </td>
                    <td>{formatNumber(row.deposit)} 万</td>
                    <td>{row.paymentMethod}</td>
                    <td>
                      <span className="badge blue">{row.status}</span>
                    </td>
                    <td className="date">
                      {new Date(row.submittedAt).toLocaleString("zh-CN")}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          disabled={opening}
                          onClick={() => openDetail(row.id)}
                        >
                          查看申请
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
            共 {result.total} 条申请 · 每页 {query.pageSize} 条
          </span>
          <div>
            <button
              className="button page-button"
              aria-label="上一页"
              disabled={loading || !!error || query.page === 1}
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
            <span>
              / {Math.max(1, Math.ceil(result.total / query.pageSize))}
            </span>
            <button
              className="button page-button"
              aria-label="下一页"
              disabled={
                loading ||
                !!error ||
                query.page * query.pageSize >= result.total
              }
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
      {creating && (
        <PurchaseForm
          onClose={() => setCreating(false)}
          onSubmitted={submitted}
        />
      )}
      {detail && (
        <Modal
          title={`申请详情 · ${detail.code}`}
          wide
          onClose={() => setDetail(null)}
        >
          <p className="modal-intro">
            {detail.status} ·{" "}
            {new Date(detail.submittedAt).toLocaleString("zh-CN")}
          </p>
          <PurchaseSummary application={detail} />
          <div className="modal-actions">
            <button className="button primary" onClick={() => setDetail(null)}>
              关闭详情
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
