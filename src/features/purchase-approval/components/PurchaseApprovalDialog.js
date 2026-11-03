import { useRef, useState } from "react";
import Modal from "../../../shared/components/Modal";
import PurchaseApplicationSummary from "./PurchaseApplicationSummary";
import ApprovalHistory from "./ApprovalHistory";
import { purchaseApplicationApi } from "../../../api/purchaseApplicationApi";
/**
 * 展示申请及历史记录，收集一级审核决定和意见。
 * 驳回要求原因；成功由上层刷新列表，失败保留审批输入。
 * @param {object} props 包含 application、onClose 和 onApprovalSubmitted。
 */
export default function PurchaseApprovalDialog({
  application,
  onClose,
  onApprovalSubmitted,
}) {
  const [decision, setDecision] = useState("approve");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const key = useRef(crypto.randomUUID());
  const previous = useRef(null);
  /**
   * 校验审批意见后提交读取时的申请版本，并阻止重复点击。
   * 未修改的失败重试复用 requestKey；不在客户端直接改变申请或房源状态。
   * @param {Event} event 表单提交事件。
   */
  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    if (decision === "reject" && !comment.trim()) {
      setError("请填写驳回原因");
      return;
    }
    if (comment.length > 1000) {
      setError("审核意见最多 1,000 字");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    const signature = JSON.stringify([decision, comment.trim()]);
    if (previous.current && previous.current !== signature)
      key.current = crypto.randomUUID();
    previous.current = signature;
    try {
      const updated = await purchaseApplicationApi.submitApproval(
        application.id,
        {
          decision,
          comment: comment.trim(),
          version: application.version,
          requestKey: key.current,
        },
      );
      onApprovalSubmitted(updated);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <Modal
      title={`审核申请 · ${application.code}`}
      wide
      busy={busy}
      onClose={onClose}
    >
      <p className="modal-intro">
        一级审核 · 当前状态：{application.status}。请核对申请资料后作出决定。
      </p>
      <PurchaseApplicationSummary application={application} />
      <ApprovalHistory history={application.history} />
      <form onSubmit={submit} noValidate>
        <fieldset className="approval-decision" disabled={busy}>
          <legend>审核结果</legend>
          <label>
            <input
              type="radio"
              name="decision"
              checked={decision === "approve"}
              onChange={() => {
                setDecision("approve");
                setError("");
              }}
            />
            通过
          </label>
          <label>
            <input
              type="radio"
              name="decision"
              checked={decision === "reject"}
              onChange={() => {
                setDecision("reject");
                setError("");
              }}
            />
            驳回
          </label>
        </fieldset>
        <div className="field">
          <label htmlFor="review-comment">
            {decision === "reject" ? "驳回原因（必填）" : "审核意见（选填）"}
          </label>
          <textarea
            id="review-comment"
            rows="3"
            maxLength="1000"
            value={comment}
            disabled={busy}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <p className="muted">
          确认后本次审核结束，结果及意见将留档。通过不会自动锁房或标记已售。
        </p>
        <div className="modal-actions">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className={`button ${decision === "reject" ? "danger" : "primary"}`}
            disabled={busy}
          >
            {busy ? "处理中…" : decision === "reject" ? "确认驳回" : "确认通过"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
