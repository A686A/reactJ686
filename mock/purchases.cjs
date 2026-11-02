const { randomUUID } = require("node:crypto");
const methods = ["全款", "商业贷款", "公积金贷款", "组合贷款"];

// Separate application aggregate: submission does not mean a completed sale.
module.exports = async function handlePurchases(context) {
  const {
    req,
    url,
    send,
    body,
    fail,
    positive,
    getProperties,
    getApplications,
    saveApplications,
  } = context;
  const match = url.pathname.match(
    /^\/api\/v1\/purchase-applications(?:\/([^/]+))?$/,
  );
  if (!match) return false;
  const id = match[1];
  const publicRow = ({ submissionKey, ...row }) => row;
  if (req.method === "GET") {
    const applications = getApplications();
    if (id) {
      const row = applications.find((item) => item.id === id);
      if (!row) throw fail(404, "购房申请不存在");
      send(200, publicRow(row));
      return true;
    }
    const p = url.searchParams,
      page = positive(p.get("page"), 1, 1000000),
      pageSize = positive(p.get("pageSize"), 8, 100);
    const keyword = (p.get("keyword") || "").trim().toLowerCase();
    const filtered = applications.filter((row) =>
      [
        row.code,
        row.buyerName,
        row.propertySnapshot.name,
        row.propertySnapshot.code,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
    send(200, {
      items: filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map(publicRow),
      total: filtered.length,
      page,
      pageSize,
    });
    return true;
  }
  if (id || req.method !== "POST")
    throw fail(405, "已提交申请只允许查看，不支持直接修改或删除");
  const input = await body(req);
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw fail(422, "请求体须为对象");
  const data = {},
    fields = {};
  for (const [key, max] of Object.entries({
    propertyId: 100,
    buyerName: 40,
    buyerPhone: 25,
    expectedSigningDate: 10,
    submissionKey: 100,
  })) {
    data[key] = typeof input[key] === "string" ? input[key].trim() : "";
    if (!data[key] || data[key].length > max)
      fields[key] = `必填，最多 ${max} 字`;
  }
  if (!/^\+?[\d\s()-]{6,25}$/.test(data.buyerPhone))
    fields.buyerPhone = "请输入有效联系电话";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data.expectedSigningDate) ||
    !Number.isFinite(Date.parse(data.expectedSigningDate)) ||
    new Date(data.expectedSigningDate).toISOString().slice(0, 10) !==
      data.expectedSigningDate
  )
    fields.expectedSigningDate = "请选择有效的预计签约日期";
  data.propertyVersion = input.propertyVersion;
  if (!Number.isInteger(data.propertyVersion) || data.propertyVersion < 1)
    fields.propertyId = "请重新选择房源";
  data.dealPrice = input.dealPrice;
  data.deposit = input.deposit;
  if (
    typeof data.dealPrice !== "number" ||
    !Number.isFinite(data.dealPrice) ||
    data.dealPrice < 0.01 ||
    data.dealPrice > 10000000
  )
    fields.dealPrice = "成交总价须为 0.01–10,000,000 万元";
  if (
    typeof data.deposit !== "number" ||
    !Number.isFinite(data.deposit) ||
    data.deposit < 0 ||
    data.deposit > data.dealPrice
  )
    fields.deposit = "意向定金须为 0 到成交总价之间的数值";
  data.paymentMethod = input.paymentMethod;
  if (!methods.includes(data.paymentMethod))
    fields.paymentMethod = "请选择付款方式";
  data.remarks = input.remarks === undefined ? "" : input.remarks;
  if (typeof data.remarks !== "string" || data.remarks.length > 1000)
    fields.remarks = "备注最多 1,000 字";
  if (Object.keys(fields).length) throw fail(422, "请检查申请信息", fields);
  const previous = getApplications().find(
    (row) => row.submissionKey === data.submissionKey,
  );
  if (previous) {
    if (Object.keys(data).some((key) => previous[key] !== data[key]))
      throw fail(409, "该提交标识已用于其他申请，请重新发起申请");
    send(200, publicRow(previous));
    return true;
  }
  const property = getProperties().find((row) => row.id === data.propertyId);
  if (!property)
    throw fail(409, "所选房源已删除，请重新选择", {
      propertyId: "房源已不存在",
    });
  if (property.status !== "在售" || property.version !== data.propertyVersion)
    throw fail(409, "房源状态或资料已变化，请重新选择并核对成交信息", {
      propertyId: "请重新选择最新的在售房源",
    });
  const uuid = randomUUID(),
    now = new Date().toISOString();
  const row = {
    ...data,
    id: uuid,
    code: `PA-${uuid.slice(0, 8).toUpperCase()}`,
    status: "已提交",
    submittedAt: now,
    propertySnapshot: {
      id: property.id,
      code: property.code,
      name: property.name,
      city: property.city,
      district: property.district,
      address: property.address,
      area: property.area,
      price: property.price,
      type: property.type,
    },
  };
  saveApplications([row, ...getApplications()]);
  send(201, publicRow(row));
  return true;
};
