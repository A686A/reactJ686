const { randomUUID } = require("node:crypto");
const methods = ["全款", "商业贷款", "公积金贷款", "组合贷款"];

// Separate application aggregate: submission does not mean a completed sale.
/**
 * 处理购房申请的查询、提交与一级审批；其他路由返回 false 交给主服务。
 * 写入前校验幂等标识、版本及状态，通过审批还须核验当前房源。
 * @param {object} context 请求、响应工具及读取/持久化数据的依赖。
 * @returns {Promise<boolean>} true 表示已经处理本次请求。
 */
module.exports = async function handlePurchaseApplications(context) {
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
    /^\/api\/v1\/purchase-applications(?:\/([^/]+)(\/(?:approvals|reviews))?)?$/,
  );
  if (!match) return false;
  const id = match[1];
  /**
   * 转换公开申请数据，移除提交幂等键及历史中的内部去重、版本校验字段。
   * 不改变持久化记录和业务快照。
   * @param {object} row 完整申请记录（通过解构接收）。
   * @returns {object} 可公开返回的申请及流程历史。
   */
  const publicRow = ({ submissionKey, ...row }) => ({
    ...row,
    history: (row.history || []).map(
      ({ requestKey, sourceVersion, ...event }) => event,
    ),
  });
  // 审批子资源兼容旧 reviews 路径，两者使用同一套状态机和幂等记录。
  const approvalRoute = Boolean(match[2]);
  if (approvalRoute) {
    if (req.method !== "POST") throw fail(405, "审核接口仅支持 POST");
    const input = await body(req);
    const fields = {};
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw fail(422, "请求体须为对象");
    if (!["approve", "reject"].includes(input.decision))
      fields.decision = "请选择通过或驳回";
    if (
      typeof input.comment !== "string" ||
      input.comment.length > 1000 ||
      (input.decision === "reject" && !input.comment.trim())
    )
      fields.comment = "驳回必须填写原因，审核意见最多 1,000 字";
    if (!Number.isInteger(input.version) || input.version < 1)
      fields.version = "申请版本无效，请刷新";
    if (
      typeof input.requestKey !== "string" ||
      !input.requestKey.trim() ||
      input.requestKey.length > 100
    )
      fields.requestKey = "审核请求标识无效";
    if (Object.keys(fields).length) throw fail(422, "请检查审核信息", fields);
    const application = getApplications().find((row) => row.id === id);
    if (!application) throw fail(404, "购房申请不存在");
    // 先识别原请求重试，再判断终态；已成功的同一请求仍可安全取回原结果。
    const previous = application.history.find(
      (event) => event.requestKey === input.requestKey,
    );
    if (previous) {
      if (
        previous.decision !== input.decision ||
        previous.comment !== input.comment.trim() ||
        previous.sourceVersion !== input.version
      )
        throw fail(409, "该请求标识已用于其他审核，请重新处理");
      send(200, publicRow(application));
      return true;
    }
    // 不同请求只能处理当前待审核版本，防止并发审批或改写终结结果。
    if (
      application.status !== "待审核" ||
      application.version !== input.version
    )
      throw fail(409, "申请已被处理或版本已变化，请刷新后查看最新结果");
    // 批准前重新核对当前房源；驳回允许房源已经改变或被删除。
    if (input.decision === "approve") {
      const property = getProperties().find(
        (row) => row.id === application.propertyId,
      );
      if (
        !property ||
        property.status !== "在售" ||
        property.version !== application.propertyVersion
      )
        throw fail(
          409,
          "关联房源已变化，无法通过审核。请核实后驳回并重新申请。",
        );
    }
    const now = new Date().toISOString();
    // 处理人由模拟服务固定，客户端不能冒充审核人；记录与新状态一起持久化。
    const event = {
      id: randomUUID(),
      action: input.decision === "approve" ? "审核通过" : "审核驳回",
      decision: input.decision,
      comment: input.comment.trim(),
      actor: "演示审核员",
      createdAt: now,
      requestKey: input.requestKey,
      sourceVersion: input.version,
    };
    const updated = {
      ...application,
      status: input.decision === "approve" ? "已通过" : "已驳回",
      version: application.version + 1,
      reviewedAt: now,
      history: [...application.history, event],
    };
    saveApplications(
      getApplications().map((row) => (row.id === id ? updated : row)),
    );
    send(200, publicRow(updated));
    return true;
  }
  if (req.method === "GET") {
    const applications = getApplications();
    if (id) {
      // 申请创建时固定房源资料快照，并创建初始版本和提交记录；不锁房或标记已售。
      const row = applications.find((item) => item.id === id);
      if (!row) throw fail(404, "购房申请不存在");
      send(200, publicRow(row));
      return true;
    }
    const p = url.searchParams,
      page = positive(p.get("page"), 1, 1000000),
      pageSize = positive(p.get("pageSize"), 8, 100);
    const keyword = (p.get("keyword") || "").trim().toLowerCase();
    const status = p.get("status") || "";
    if (status && !["待审核", "已通过", "已驳回"].includes(status))
      throw fail(400, "无效审核状态");
    // 关键词和状态用于列表过滤，审批统计保持全库口径。
    const filtered = applications.filter(
      (row) =>
        (!status || row.status === status) &&
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
      summary: {
        pending: applications.filter((row) => row.status === "待审核").length,
        approved: applications.filter((row) => row.status === "已通过").length,
        rejected: applications.filter((row) => row.status === "已驳回").length,
      },
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
  // 同一提交标识只能对应相同的业务内容；不一致返回冲突而不是静默复用。
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
    status: "待审核",
    version: 1,
    history: [
      {
        id: randomUUID(),
        action: "提交申请",
        actor: "演示申请人",
        comment: "",
        createdAt: now,
      },
    ],
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
