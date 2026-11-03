const {
  buildProperty,
} = require("../../property-management/fixtures/propertyApiFixtures.cjs");

/**
 * 返回有效购房申请请求，不调用前端转换函数。
 * 基线：propertyId=property-1、propertyVersion=1、buyerName=测试买方、buyerPhone=13800138000。
 * dealPrice=480万元、deposit=20万元、paymentMethod=全款、expectedSigningDate=2027-01-15。
 * remarks=测试申请、submissionKey=submission-test-1；失败场景仅替换明确注明的值。
 */
function buildApplicationPayload(overrides = {}) {
  return {
    propertyId: "property-1",
    propertyVersion: 1,
    buyerName: "测试买方",
    buyerPhone: "13800138000",
    dealPrice: 480,
    deposit: 20,
    paymentMethod: "全款",
    expectedSigningDate: "2027-01-15",
    remarks: "测试申请",
    submissionKey: "submission-test-1",
    ...overrides,
  };
}

/**
 * 直接准备申请前置数据，查询和审批测试不依赖新增接口先成功。
 * 快照由固定测试数据生成，故当前房源修改或删除可与历史资料独立设置。
 * 默认业务输入沿用 buildApplicationPayload；系统值为 id=application-1、code=PA-TEST-001、status=待审核、version=1。
 * submittedAt=2026-01-05T00:00:00.000Z，快照取 buildProperty 的 ID/编号/名称/城市/区域/地址/面积/价格/类型。
 * 默认历史仅1条：id=event-submit-1、action=提交申请、actor=演示申请人、comment=""，时间同submittedAt。
 */
function buildApplication(overrides = {}) {
  const property = buildProperty();
  return {
    ...buildApplicationPayload(),
    id: "application-1",
    code: "PA-TEST-001",
    status: "待审核",
    version: 1,
    submittedAt: "2026-01-05T00:00:00.000Z",
    propertySnapshot: Object.fromEntries(
      [
        "id",
        "code",
        "name",
        "city",
        "district",
        "address",
        "area",
        "price",
        "type",
      ].map((key) => [key, property[key]]),
    ),
    history: [
      {
        id: "event-submit-1",
        action: "提交申请",
        actor: "演示申请人",
        comment: "",
        createdAt: "2026-01-05T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

/**
 * 一级审批请求基线：decision=approve、comment=资料核验通过、version=1、requestKey=approval-test-1。
 * 原样重试保持这些值；拒绝场景会明确覆盖其中字段。
 */
function buildApprovalPayload(overrides = {}) {
  return {
    decision: "approve",
    comment: "资料核验通过",
    version: 1,
    requestKey: "approval-test-1",
    ...overrides,
  };
}
module.exports = {
  buildApplicationPayload,
  buildApplication,
  buildApprovalPayload,
};
