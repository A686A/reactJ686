import { useRef, useState } from "react";
import { purchaseApplicationApi } from "../../api/purchaseApplicationApi";
import PurchaseApplicationDialog from "../../features/purchase-approval/components/PurchaseApplicationDialog";
import PurchaseApplicationSummary from "../../features/purchase-approval/components/PurchaseApplicationSummary";
import { usePurchaseApplicationList } from "../../features/purchase-approval/hooks/usePurchaseApplicationList";
import { formatNumber } from "../../shared/utils/format";
import Modal from "../../shared/components/Modal";
import PurchaseApprovalDialog from "../../features/purchase-approval/components/PurchaseApprovalDialog";
import ApprovalHistory from "../../features/purchase-approval/components/ApprovalHistory";
import {
  APPROVAL_STATUSES,
  APPROVAL_STATUS_CLASSES,
} from "../../features/purchase-approval/model/purchaseApprovalModel";
export default function PurchaseApprovalPage() {
  const { query, setQuery, result, loading, error, refresh } =
    usePurchaseApplicationList();
  const [keyword, setKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);
  const [applicationUnderApproval, setApplicationUnderApproval] =
    useState(null);
  const [notice, setNotice] = useState("");
  const [detailError, setDetailError] = useState("");
  const [opening, setOpening] = useState(false);
  const lock = useRef(false);
  async function openDetail(id, mode = "detail") {
    if (lock.current) return;
    lock.current = true;
    setOpening(true);
    setDetailError("");
    try {
      const application = await purchaseApplicationApi.getById(id);
      if (mode === "approval") {
        if (application.status !== "待审核") {
          setDetailError("申请已被处理，请刷新后查看最新结果");
          refresh();
        } else setApplicationUnderApproval(application);
      } else setDetail(application);
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
    setQuery((previous) => ({ ...previous, keyword: "", status: "", page: 1 }));
    refresh();
    setNotice(
      `购房申请已提交，已进入待审核队列，申请编号：${application.code}`,
    );
  }
  return (
    <>
      <div className="breadcrumb">
        交易管理 <span>/</span>
        <strong>审核流程</strong>
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">PURCHASE APPROVAL</div>
          <h1>
            购房审核，让每一步有据可循<span>。</span>
          </h1>
          <p>独立管理购房申请与审核，保留成交资料及处理轨迹。</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          ＋ 发起购房申请
        </button>
      </header>
      <section className="approval-banner">
        <strong>一级购房审核流程</strong>
        <p>选择房源并填写申请 → 确认提交 → 待审核 → 通过 / 驳回</p>
        <small>
          驳回必须填写原因；审核通过不会自动锁房或标记已售。当前处理人为演示审核员，未接入真实权限系统。
        </small>
      </section>
      <section className="stats approval-stats" aria-label="审核统计">
        {[
          ["待审核", result.summary.pending],
          ["已通过", result.summary.approved],
          ["已驳回", result.summary.rejected],
        ].map(([label, count]) => (
          <article className="stat" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">
              {count}
              <small>笔</small>
            </div>
          </article>
        ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              审核工作台 <span className="count-pill">{result.total}</span>
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
        <div className="approval-tabs" role="group" aria-label="审核状态筛选">
          {["", ...APPROVAL_STATUSES].map((status) => (
            <button
              type="button"
              key={status}
              aria-pressed={query.status === status}
              className={query.status === status ? "active" : ""}
              onClick={() =>
                setQuery((previous) => ({ ...previous, status, page: 1 }))
              }
            >
              {status || "全部申请"}
            </button>
          ))}
        </div>
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
                      <span
                        className={`badge ${APPROVAL_STATUS_CLASSES[row.status]}`}
                      >
                        {row.status}
                      </span>
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
                        {row.status === "待审核" && (
                          <button
                            disabled={opening}
                            onClick={() => openDetail(row.id, "approval")}
                          >
                            处理审核
                          </button>
                        )}
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
        <PurchaseApplicationDialog
          onClose={() => setCreating(false)}
          onSubmitted={submitted}
        />
      )}
      {applicationUnderApproval && (
        <PurchaseApprovalDialog
          application={applicationUnderApproval}
          onClose={() => setApplicationUnderApproval(null)}
          onApprovalSubmitted={(application) => {
            setApplicationUnderApproval(null);
            setNotice(
              `申请 ${application.code} ${application.status}，审核结果已留档。`,
            );
            refresh();
          }}
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
          <PurchaseApplicationSummary application={detail} />
          <ApprovalHistory history={detail.history} />
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
