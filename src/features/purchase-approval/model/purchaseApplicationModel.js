export const PAYMENT_METHODS = ["全款", "商业贷款", "公积金贷款", "组合贷款"];
export const EMPTY_PURCHASE_APPLICATION = {
  buyerName: "",
  buyerPhone: "",
  dealPrice: "",
  deposit: "0",
  paymentMethod: "全款",
  expectedSigningDate: "",
  remarks: "",
};
/**
 * 校验已选房源、买方信息、金额、付款方式和有效签约日期。
 * 日期通过解析后回写比对，拒绝 2 月 30 日等被自动顺延的输入。
 * @param {object} values 申请表单原始值。
 * @param {object|null} property 所选房源，未选择时为 null。
 * @returns {object} 按字段组织的校验错误。
 */
export function validatePurchaseApplication(values, property) {
  const errors = {};
  if (!property) errors.propertyId = "请选择一套在售房源";
  if (!values.buyerName.trim() || values.buyerName.trim().length > 40)
    errors.buyerName = "请输入买方姓名（最多 40 字）";
  if (!/^\+?[\d\s()-]{6,25}$/.test(values.buyerPhone.trim()))
    errors.buyerPhone = "请输入有效联系电话";
  if (
    !(Number(values.dealPrice) >= 0.01 && Number(values.dealPrice) <= 10000000)
  )
    errors.dealPrice = "成交总价须为 0.01–10,000,000 万元";
  if (
    values.deposit === "" ||
    !Number.isFinite(Number(values.deposit)) ||
    Number(values.deposit) < 0 ||
    Number(values.deposit) > Number(values.dealPrice)
  )
    errors.deposit = "意向定金须为 0 到成交总价之间的数值";
  if (!PAYMENT_METHODS.includes(values.paymentMethod))
    errors.paymentMethod = "请选择付款方式";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(values.expectedSigningDate) ||
    !Number.isFinite(Date.parse(values.expectedSigningDate)) ||
    new Date(values.expectedSigningDate).toISOString().slice(0, 10) !==
      values.expectedSigningDate
  )
    errors.expectedSigningDate = "请选择有效的预计签约日期";
  if (values.remarks.length > 1000) errors.remarks = "备注最多 1,000 字";
  return errors;
}
/**
 * 转换金额并修整文本，同时附加房源 ID、读取版本及幂等标识。
 * @param {object} values 原始申请表单。
 * @param {object} property 用户核对过的房源及版本。
 * @param {string} submissionKey 同一次提交重试保持不变的标识。
 * @returns {object} 提交购房申请的请求体。
 */
export function toPurchaseApplicationPayload(values, property, submissionKey) {
  return {
    ...values,
    buyerName: values.buyerName.trim(),
    buyerPhone: values.buyerPhone.trim(),
    remarks: values.remarks.trim(),
    dealPrice: Number(values.dealPrice),
    deposit: Number(values.deposit),
    propertyId: property.id,
    propertyVersion: property.version,
    submissionKey,
  };
}
