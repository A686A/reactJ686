import { useRef, useState } from "react";
import Modal from "../../../shared/components/Modal";
import { purchaseApplicationApi } from "../../../api/purchaseApplicationApi";
import {
  toPurchaseApplicationPayload,
  EMPTY_PURCHASE_APPLICATION,
  PAYMENT_METHODS,
  validatePurchaseApplication,
} from "../model/purchaseApplicationModel";
import PropertySelector from "./PropertySelector";
import PurchaseApplicationSummary from "./PurchaseApplicationSummary";

export default function PurchaseApplicationDialog({ onClose, onSubmitted }) {
  const [values, setValues] = useState({ ...EMPTY_PURCHASE_APPLICATION });
  const [property, setProperty] = useState(null);
  const [errors, setErrors] = useState({});
  const [isConfirmationStep, setConfirmationStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const key = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const attempted = useRef(null);
  const update = (name, value) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
  };
  const field = (name, label, type = "text", maxLength) => (
    <div className="field" key={name}>
      <label htmlFor={`purchase-${name}`}>
        {label}
        <span className="required"> *</span>
      </label>
      <input
        id={`purchase-${name}`}
        type={type}
        value={values[name]}
        maxLength={maxLength}
        step={type === "number" ? "0.01" : undefined}
        min={name === "deposit" ? 0 : 0.01}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `error-${name}` : undefined}
        onChange={(e) => update(name, e.target.value)}
      />
      {errors[name] && (
        <span className="field-error" id={`error-${name}`}>
          {errors[name]}
        </span>
      )}
    </div>
  );
  function toReview(event) {
    event.preventDefault();
    const validation = validatePurchaseApplication(values, property);
    setErrors(validation);
    if (!Object.keys(validation).length) {
      setMessage("");
      setConfirmationStep(true);
    }
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const payload = toPurchaseApplicationPayload(values, property, key.current);
    // Keep the key for an unchanged retry after a network timeout. Changed input is a new submission.
    const signature = JSON.stringify({ ...payload, submissionKey: undefined });
    if (attempted.current && attempted.current !== signature)
      key.current = crypto.randomUUID();
    payload.submissionKey = key.current;
    attempted.current = signature;
    try {
      const result = await purchaseApplicationApi.submitApplication(payload);
      onSubmitted(result);
    } catch (error) {
      setMessage(error.message);
      setErrors(error.fields || {});
      if (error.status === 409 || error.fields?.propertyId) {
        setConfirmationStep(false);
        setProperty(null);
      } else if (error.status === 422) setConfirmationStep(false);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={isConfirmationStep ? "确认购房申请" : "发起购房申请"}
      onClose={onClose}
      busy={busy}
      wide
    >
      <ol className="application-steps" aria-label="申请步骤">
        <li className={!isConfirmationStep ? "current" : ""}>01 填写申请</li>
        <li className={isConfirmationStep ? "current" : ""}>02 核对并提交</li>
      </ol>
      <p className="modal-intro">
        {isConfirmationStep
          ? "请核对房源与成交信息，确认后提交。申请提交不代表审批通过或交易完成。"
          : "先选择一套在售房源，再填写买方和拟成交信息。金额单位为万元。"}
      </p>
      {message && (
        <div className="alert error" role="alert">
          {message}
        </div>
      )}
      {isConfirmationStep ? (
        <>
          <PurchaseApplicationSummary
            application={{
              ...toPurchaseApplicationPayload(values, property, key.current),
              propertySnapshot: property,
            }}
          />
          <div className="alert success">
            提交后生成申请编号，申请资料以提交时的信息留档。定金字段仅登记意向，不发起支付。
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setConfirmationStep(false)}
            >
              返回修改
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={submit}
            >
              {busy ? "提交中…" : "确认提交"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={toReview} noValidate>
          <PropertySelector
            selected={property}
            error={errors.propertyId}
            onSelect={(row) => {
              setProperty(row);
              setErrors((previous) => ({ ...previous, propertyId: "" }));
            }}
          />
          <h3 className="form-section-title">买方与成交信息</h3>
          <div className="form-fields">
            {field("buyerName", "买方姓名", "text", 40)}
            {field("buyerPhone", "联系电话", "tel", 25)}
            {field("dealPrice", "成交总价（万元）", "number")}
            {field("deposit", "意向定金（万元）", "number")}
            <div className="field">
              <label htmlFor="purchase-payment">
                付款方式 <span className="required">*</span>
              </label>
              <select
                id="purchase-payment"
                value={values.paymentMethod}
                onChange={(e) => update("paymentMethod", e.target.value)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </div>
            {field("expectedSigningDate", "预计签约日期", "date")}
            <div className="field span-2">
              <label htmlFor="purchase-remarks">申请备注</label>
              <textarea
                id="purchase-remarks"
                rows="3"
                maxLength="1000"
                value={values.remarks}
                onChange={(e) => update("remarks", e.target.value)}
              />
              {errors.remarks && (
                <span className="field-error">{errors.remarks}</span>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button className="button primary">下一步，核对申请</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
