export const PAYMENT_METHODS = ["全款", "商业贷款", "公积金贷款", "组合贷款"];
export const EMPTY_APPLICATION = {
  buyerName: "",
  buyerPhone: "",
  dealPrice: "",
  deposit: "0",
  paymentMethod: "全款",
  expectedSigningDate: "",
  remarks: "",
};
export function validateApplication(values, property) {
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
export function applicationPayload(values, property, submissionKey) {
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
