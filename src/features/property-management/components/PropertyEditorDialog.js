import { useState } from "react";
import Modal from "../../../shared/components/Modal";
import {
  EMPTY_PROPERTY,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  toPropertyPayload,
  validateProperty,
} from "../model/propertyFormModel";

export default function PropertyEditorDialog({ property, onClose, onSubmit }) {
  const [values, setValues] = useState(
    property ? { ...property } : { ...EMPTY_PROPERTY },
  );
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const field = (key, label, options = {}) => (
    <div className={`field ${options.full ? "span-2" : ""}`} key={key}>
      <label htmlFor={key}>
        {label}
        {key !== "description" && <span className="required"> *</span>}
      </label>
      {options.choices ? (
        <select
          id={key}
          value={values[key]}
          onChange={(e) => change(key, e.target.value)}
        >
          {options.choices.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      ) : key === "description" ? (
        <textarea
          id={key}
          rows="3"
          maxLength="1000"
          value={values[key]}
          onChange={(e) => change(key, e.target.value)}
        />
      ) : (
        <input
          id={key}
          type={options.number ? "number" : "text"}
          step={key === "rooms" ? "1" : "0.01"}
          min={key === "rooms" ? "0" : "0.01"}
          maxLength={options.maxLength}
          placeholder={options.placeholder}
          value={values[key]}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${key}-error` : undefined}
          onChange={(e) => change(key, e.target.value)}
        />
      )}
      {errors[key] && (
        <span className="field-error" id={`${key}-error`}>
          {errors[key]}
        </span>
      )}
    </div>
  );
  function change(key, value) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  }
  async function submit(event) {
    event.preventDefault();
    const validation = validateProperty(values);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setBusy(true);
    setMessage("");
    try {
      await onSubmit(toPropertyPayload(values), property?.version);
    } catch (error) {
      setMessage(error.message);
      setErrors(error.fields || {});
      setBusy(false);
    }
  }
  return (
    <Modal
      title={property ? "编辑房源" : "新增房源"}
      onClose={onClose}
      busy={busy}
      wide
    >
      <p className="modal-intro">
        维护准确的房源资料，标有 <span className="required">*</span>{" "}
        的项目为必填项。
      </p>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={busy} className="form-fields">
          <legend className="sr-only">房源信息</legend>
          {field("name", "房源名称", {
            full: true,
            maxLength: 80,
            placeholder: "例如：滨江壹号 · 江景三居",
          })}
          {field("city", "城市", { maxLength: 30, placeholder: "上海" })}
          {field("district", "区域", {
            maxLength: 30,
            placeholder: "浦东新区",
          })}
          {field("address", "详细地址", {
            full: true,
            maxLength: 200,
            placeholder: "街道、楼栋及房号",
          })}
          {field("type", "房源类型", { choices: PROPERTY_TYPES })}
          {field("status", "房源状态", { choices: PROPERTY_STATUSES })}
          {field("area", "建筑面积（㎡）", { number: true })}
          {field("price", "总价（万元）", { number: true })}
          {field("rooms", "房间数", { number: true })}
          {field("contact", "联系人", { maxLength: 40 })}
          {field("phone", "联系电话", { maxLength: 25 })}
          {field("description", "备注", { full: true })}
        </fieldset>
        {message && (
          <div className="alert error" role="alert">
            {message}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "保存中…" : "保存房源"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
