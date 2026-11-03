export const PROPERTY_TYPES = ["住宅", "公寓", "商铺", "写字楼"];
export const PROPERTY_STATUSES = ["待上架", "在售", "已售", "已下架"];
export const EMPTY_PROPERTY = {
  name: "",
  city: "",
  district: "",
  address: "",
  type: "住宅",
  status: "待上架",
  area: "",
  price: "",
  rooms: "",
  contact: "",
  phone: "",
  description: "",
};

/**
 * 校验房源必填项、字符串长度、联系电话、枚举及数值范围。
 * 仅用于前端提示；服务端仍须独立校验。
 * @param {object} value 包含控件原始值的房源表单。
 * @returns {object} 以字段名为键的错误信息，空对象表示通过。
 */
export function validateProperty(value) {
  const errors = {};
  const required = {
    name: "房源名称",
    city: "城市",
    district: "区域",
    address: "详细地址",
    contact: "联系人",
    phone: "联系电话",
  };
  Object.entries(required).forEach(([key, label]) => {
    if (!String(value[key] || "").trim()) errors[key] = `请输入${label}`;
  });
  if (String(value.name).length > 80) errors.name = "房源名称最多 80 字";
  if (String(value.city).length > 30) errors.city = "城市最多 30 字";
  if (String(value.district).length > 30) errors.district = "区域最多 30 字";
  if (String(value.address).length > 200) errors.address = "地址最多 200 字";
  if (String(value.contact).length > 40) errors.contact = "联系人最多 40 字";
  if (!/^\+?[\d\s()-]{6,25}$/.test(value.phone || ""))
    errors.phone = "请输入有效联系电话（6–25 位）";
  if (!(Number(value.area) >= 0.01 && Number(value.area) <= 1000000))
    errors.area = "建筑面积须至少为 0.01 且不超过 1,000,000";
  if (!(Number(value.price) >= 0.01 && Number(value.price) <= 10000000))
    errors.price = "总价须至少为 0.01 且不超过 10,000,000 万元";
  if (
    value.rooms === "" ||
    !Number.isInteger(Number(value.rooms)) ||
    Number(value.rooms) < 0 ||
    Number(value.rooms) > 100
  )
    errors.rooms = "房间数须为 0–100 的整数";
  if (!PROPERTY_TYPES.includes(value.type)) errors.type = "请选择房源类型";
  if (!PROPERTY_STATUSES.includes(value.status))
    errors.status = "请选择房源状态";
  if (String(value.description || "").length > 1000)
    errors.description = "备注最多 1,000 字";
  return errors;
}

/**
 * 仅提取允许提交的业务字段，去除字符串首尾空白并转换数值。
 * 不携带 id、系统编号或时间戳等服务端维护字段。
 * @param {object} value 房源表单原始数据。
 * @returns {object} 可供新增或修改接口使用的请求数据。
 */
export function toPropertyPayload(value) {
  return Object.fromEntries(
    Object.keys(EMPTY_PROPERTY).map((key) => [
      key,
      ["area", "price", "rooms"].includes(key)
        ? Number(value[key])
        : String(value[key]).trim(),
    ]),
  );
}

export { formatNumber } from "../../../shared/utils/format";
