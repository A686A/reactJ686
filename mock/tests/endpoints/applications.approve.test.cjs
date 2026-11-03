const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createApiContext } = require("../helpers/apiTestContext.cjs");
const {
  buildApplication,
  buildApprovalPayload,
  buildProperty,
} = require("../helpers/fixtures.cjs");
const route = "/purchase-applications/application-1/approvals";

/** 独立准备房源和待审核申请，不依赖提交接口先运行；所有用例均启动自己的服务。 */
function createApprovalContext(t, overrides = {}) {
  return createApiContext(t, {
    properties: [buildProperty()],
    purchaseApplications: [buildApplication()],
    ...overrides,
  });
}

describe("POST /api/v1/purchase-applications/:id/approvals", () => {
  /** 测试内容：批准有效申请。测试值：version=1、decision=approve、comment=资料核验通过、requestKey=approval-test-1；伪造actor=伪造人员。预期：200、已通过/version2、历史2条、处理人为演示审核员；原房源不变。 */
  it("通过后更新状态和版本、追加真实服务端处理记录", async (t) => {
    const api = await createApprovalContext(t);
    const before = await api.readDatabase();
    const { status, data } = await api.request(route, {
      method: "POST",
      payload: buildApprovalPayload({ actor: "伪造人员" }),
    });
    assert.equal(status, 200);
    assert.equal(data.status, "已通过");
    assert.equal(data.version, 2);
    assert.equal(data.history.length, 2);
    const event = data.history[1];
    assert.equal(event.action, "审核通过");
    assert.equal(event.actor, "演示审核员");
    assert.equal(event.comment, "资料核验通过");
    assert.ok(Number.isFinite(Date.parse(data.reviewedAt)));
    assert.equal(Object.hasOwn(event, "requestKey"), false);
    assert.equal(Object.hasOwn(event, "sourceVersion"), false);
    const stored = await api.readDatabase();
    assert.equal(stored.purchaseApplications[0].status, "已通过");
    assert.deepEqual(stored.properties, before.properties);
  });
  /** 测试内容：有效驳回。测试值：decision=reject、comment='  缺少资料  '、version=1。预期：200、已驳回/version2，意见去掉首尾空格为“缺少资料”，历史2条。 */
  it("驳回并持久化修整后的原因", async (t) => {
    const api = await createApprovalContext(t);
    const { status, data } = await api.request(route, {
      method: "POST",
      payload: buildApprovalPayload({
        decision: "reject",
        comment: "  缺少资料  ",
      }),
    });
    assert.equal(status, 200);
    assert.equal(data.status, "已驳回");
    assert.equal(data.version, 2);
    assert.equal(data.history.length, 2);
    assert.equal(data.history[1].comment, "缺少资料");
    assert.equal(
      (await api.readDatabase()).purchaseApplications[0].history[1].comment,
      "缺少资料",
    );
  });
  const invalid = [
    // 测试值：decision=invalid；预期422，fields.decision非空，文件不变。
    ["决定无效", { decision: "invalid" }, "decision"],
    // 测试值：decision=reject、comment='   '；预期422，fields.comment非空。
    ["驳回原因为空", { decision: "reject", comment: "   " }, "comment"],
    // 测试值：comment为1001个字；预期422，超过1000字上限。
    ["审核意见超长", { comment: "字".repeat(1001) }, "comment"],
    // 测试值：version=0；预期422，格式非法而非业务版本冲突。
    ["版本格式无效", { version: 0 }, "version"],
    // 测试值：requestKey=''；预期422，缺少去重标识。
    ["请求标识缺失", { requestKey: "" }, "requestKey"],
  ];
  for (const [label, overrides, field] of invalid) {
    /** 前置为待审核/version1；除覆盖字段外使用合法审批参数；错误不能增加历史或改变状态。 */
    it(`422：${label}`, async (t) => {
      const api = await createApprovalContext(t);
      const before = await api.readDatabase();
      const response = await api.request(route, {
        method: "POST",
        payload: buildApprovalPayload(overrides),
      });
      assert.equal(response.status, 422);
      assert.ok(response.data.fields[field]);
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  /** 测试值：申请集合为空、目标application-1、审批参数合法。预期：404，不创建申请。 */
  it("申请不存在返回 404", async (t) => {
    const api = await createApprovalContext(t, { purchaseApplications: [] });
    assert.equal(
      (
        await api.request(route, {
          method: "POST",
          payload: buildApprovalPayload(),
        })
      ).status,
      404,
    );
    assert.deepEqual((await api.readDatabase()).purchaseApplications, []);
  });
  /** 测试值：当前申请version=1，提交version=99。预期：409，状态仍待审核、历史仍1条、文件完全不变。 */
  it("旧申请版本不允许审批", async (t) => {
    const api = await createApprovalContext(t);
    const before = await api.readDatabase();
    assert.equal(
      (
        await api.request(route, {
          method: "POST",
          payload: buildApprovalPayload({ version: 99 }),
        })
      ).status,
      409,
    );
    assert.deepEqual(await api.readDatabase(), before);
  });
  for (const status of ["已通过", "已驳回"]) {
    /** 测试值：直接预置终态已通过/已驳回、version2，提交匹配version2的新审批键。预期409：即使版本正确，也不能再次处理终态；文件不变。 */
    it(`申请${status}后不可再次审批`, async (t) => {
      const api = await createApprovalContext(t, {
        purchaseApplications: [buildApplication({ status, version: 2 })],
      });
      const before = await api.readDatabase();
      assert.equal(
        (
          await api.request(route, {
            method: "POST",
            payload: buildApprovalPayload({ version: 2 }),
          })
        ).status,
        409,
      );
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  for (const [label, properties] of [
    // 测试值：properties=[]；预期批准返回409，关联房源不存在。
    ["房源已删除", []],
    // 测试值：property-1.status=已售；预期批准返回409，不能批准非在售房源。
    ["房源已售", [buildProperty({ status: "已售" })]],
    // 测试值：当前房源version2、申请propertyVersion1；预期批准返回409，快照版本过期。
    ["房源版本变化", [buildProperty({ version: 2 })]],
  ]) {
    /** 前置申请仍待审核/version1；合法批准请求被房源业务校验拒绝，申请及历史不可改变。 */
    it(`拒绝通过：${label}`, async (t) => {
      const api = await createApprovalContext(t, { properties });
      const before = await api.readDatabase();
      assert.equal(
        (
          await api.request(route, {
            method: "POST",
            payload: buildApprovalPayload(),
          })
        ).status,
        409,
      );
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  /** 测试值：properties=[]、申请仍在，decision=reject、comment=房源已删除。预期200/已驳回：驳回不要求房源继续存在。 */
  it("房源删除后仍允许驳回历史申请", async (t) => {
    const api = await createApprovalContext(t, { properties: [] });
    const response = await api.request(route, {
      method: "POST",
      payload: buildApprovalPayload({
        decision: "reject",
        comment: "房源已删除",
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.status, "已驳回");
    assert.equal(response.data.history[1].comment, "房源已删除");
  });
  /** 测试值：同一requestKey=approval-test-1、相同version1和意见连续提交两次。预期两次200、版本仅到2、历史仅2条，第二次不写新记录。 */
  it("原审批请求重试不重复追加历史", async (t) => {
    const api = await createApprovalContext(t);
    const payload = buildApprovalPayload();
    await api.request(route, { method: "POST", payload });
    const before = await api.readDatabase();
    const response = await api.request(route, { method: "POST", payload });
    assert.equal(response.status, 200);
    assert.equal(response.data.version, 2);
    assert.equal(response.data.history.length, 2);
    assert.deepEqual(await api.readDatabase(), before);
  });
  /** 测试值：先通过，再用同一requestKey把comment改为“修改意见”。预期409，原审批结果、意见及历史文件不变。 */
  it("相同请求键改变内容返回冲突", async (t) => {
    const api = await createApprovalContext(t);
    await api.request(route, {
      method: "POST",
      payload: buildApprovalPayload(),
    });
    const before = await api.readDatabase();
    assert.equal(
      (
        await api.request(route, {
          method: "POST",
          payload: buildApprovalPayload({ comment: "修改意见" }),
        })
      ).status,
      409,
    );
    assert.deepEqual(await api.readDatabase(), before);
  });
  /** 测试值：先经/approvals通过，再同内容经旧/reviews重试。预期200，已通过/version2且历史仍2条；别名与正式接口共用幂等记录。 */
  it("旧 reviews 别名与 approvals 使用相同审批记录", async (t) => {
    const api = await createApprovalContext(t);
    const payload = buildApprovalPayload();
    await api.request(route, { method: "POST", payload });
    const response = await api.request(
      route.replace("/approvals", "/reviews"),
      { method: "POST", payload },
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.version, 2);
    assert.equal(response.data.history.length, 2);
  });
  for (const [label, options, expected] of [
    // 测试值：GET审批路径；预期405，审批只接受POST。
    ["错误请求方法", {}, 405],
    // 测试值：POST请求体[]；预期422，必须为对象。
    ["非对象请求体", { method: "POST", payload: [] }, 422],
    // 测试值：POST原始请求体'{bad'；预期400。
    ["非法 JSON", { method: "POST", rawBody: "{bad" }, 400],
    // 测试值：POST合法审批体、Content-Type=text/plain；预期415。
    [
      "错误内容类型",
      {
        method: "POST",
        payload: buildApprovalPayload(),
        contentType: "text/plain",
      },
      415,
    ],
  ]) {
    /** 前置待审核/version1，验证协议层失败不会产生任何审批副作用。 */
    it(`拒绝${label}`, async (t) => {
      const api = await createApprovalContext(t);
      const before = await api.readDatabase();
      assert.equal((await api.request(route, options)).status, expected);
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
});
