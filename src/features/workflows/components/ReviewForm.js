import { useRef, useState } from "react";
import Modal from "../../../shared/components/Modal";
import PurchaseSummary from "./PurchaseSummary";
import ReviewHistory from "./ReviewHistory";
import { purchaseWorkflowApi } from "../api/purchaseWorkflow";
export default function ReviewForm({ application, onClose, onReviewed }) {
  const [decision, setDecision] = useState("approve");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const key = useRef(crypto.randomUUID());
  const previous = useRef(null);
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
      const updated = await purchaseWorkflowApi.review(application.id, {
        decision,
        comment: comment.trim(),
        version: application.version,
        requestKey: key.current,
      });
      onReviewed(updated);
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
      <PurchaseSummary application={application} />
      <ReviewHistory history={application.history} />
      <form onSubmit={submit} noValidate>
        <fieldset className="review-decision" disabled={busy}>
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
