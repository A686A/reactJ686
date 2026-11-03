const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createPurchaseApprovalApiContext: createApiContext,
} = require("../helpers/purchaseApprovalApiContext.cjs");
const { buildApplication } = require("../fixtures/purchaseApiFixtures.cjs");

/** 返回两份独立申请：application-1 待审核，application-2 已通过；用于已知分页及统计结果。 */
function applications() {
  return [
    buildApplication(),
    buildApplication({
      id: "application-2",
      code: "PA-TEST-002",
      buyerName: "另一买方",
      submissionKey: "submission-2",
      status: "已通过",
      version: 2,
      history: [
        {
          id: "submit-2",
          action: "提交申请",
          actor: "演示申请人",
          comment: "",
          createdAt: "2026-01-04T00:00:00.000Z",
        },
        {
          id: "approve-2",
          action: "审核通过",
          actor: "演示审核员",
          comment: "已核验",
          createdAt: "2026-01-05T00:00:00.000Z",
          decision: "approve",
          requestKey: "internal-review-key",
          sourceVersion: 1,
        },
      ],
    }),
  ];
}

describe("GET /api/v1/purchase-applications", () => {
  /** 测试内容：无申请时正常查询。测试值：purchaseApplications=[]，不传查询参数。预期：200，items=[]、total=0、page=1、pageSize=8，全部审批统计为 0。 */
  it("空数据库返回正确分页与零统计", async (t) => {
    const api = await createApiContext(t);
    const { status, data } = await api.request("/purchase-applications");
    assert.equal(status, 200);
    assert.deepEqual(data, {
      items: [],
      total: 0,
      page: 1,
      pageSize: 8,
      summary: { pending: 0, approved: 0, rejected: 0 },
    });
  });
  /** 测试内容：独立分页。测试值：预置两份申请，page=2、pageSize=1。预期：200，仅返回 application-2，total=2，原分页参数不变。 */
  it("按指定页码和每页数量返回申请", async (t) => {
    const api = await createApiContext(t, {
      purchaseApplications: applications(),
    });
    const { status, data } = await api.request(
      "/purchase-applications?page=2&pageSize=1",
    );
    assert.equal(status, 200);
    assert.equal(data.total, 2);
    assert.equal(data.page, 2);
    assert.equal(data.pageSize, 1);
    assert.deepEqual(
      data.items.map((row) => row.id),
      ["application-2"],
    );
  });
  for (const [label, keyword, expectedIds] of [
    // 测试值：keyword=PA-TEST-001（申请编号）；预期：200，仅返回 application-1。
    ["申请编号", "PA-TEST-001", ["application-1"]],
    // 测试值：keyword=另一买方；预期：200，仅返回 application-2。
    ["买方姓名", "另一买方", ["application-2"]],
    // 测试值：keyword=re-test-001（小写房源编号）；预期：200，忽略大小写返回两份申请。
    ["房源编号忽略大小写", "re-test-001", ["application-1", "application-2"]],
    // 测试值：keyword=missing；预期：200，items=[]、total=0。
    ["无匹配结果", "missing", []],
  ]) {
    /** 每个关键词用例单独准备两份申请；核对精确 ID 集合及 total，不仅检查非空。 */
    it(`按${label}搜索`, async (t) => {
      const api = await createApiContext(t, {
        purchaseApplications: applications(),
      });
      const { status, data } = await api.request(
        `/purchase-applications?${new URLSearchParams({ keyword })}`,
      );
      assert.equal(status, 200);
      assert.deepEqual(
        data.items.map((row) => row.id),
        expectedIds,
      );
      assert.equal(data.total, expectedIds.length);
    });
  }
  /** 测试内容：筛选与全库统计口径。测试值：两份申请，status=待审核。预期：200，仅 application-1、total=1；summary={pending:1,approved:1,rejected:0}。 */
  it("审批状态筛选不改变全库统计", async (t) => {
    const api = await createApiContext(t, {
      purchaseApplications: applications(),
    });
    const { status, data } = await api.request(
      `/purchase-applications?${new URLSearchParams({ status: "待审核" })}`,
    );
    assert.equal(status, 200);
    assert.deepEqual(
      data.items.map((row) => row.id),
      ["application-1"],
    );
    assert.equal(data.total, 1);
    assert.deepEqual(data.summary, { pending: 1, approved: 1, rejected: 0 });
  });
  /** 测试内容：响应字段脱敏。测试值：预置 submissionKey 及审批历史 requestKey/sourceVersion。预期：200，两条结果均移除内部字段，审批意见“已核验”保留。 */
  it("列表不暴露内部幂等字段", async (t) => {
    const api = await createApiContext(t, {
      purchaseApplications: applications(),
    });
    const { status, data } = await api.request("/purchase-applications");
    assert.equal(status, 200);
    for (const row of data.items) {
      assert.equal(Object.hasOwn(row, "submissionKey"), false);
      for (const event of row.history) {
        assert.equal(Object.hasOwn(event, "requestKey"), false);
        assert.equal(Object.hasOwn(event, "sourceVersion"), false);
      }
    }
    assert.equal(data.items[1].history[1].comment, "已核验");
  });
  for (const query of [
    // 测试值：status=invalid；预期：400，不返回成功分页数据，不修改持久化文件。
    "status=invalid",
    // 测试值：page=0；预期：400，不修改文件。
    "page=0",
    // 测试值：page=1.5；预期：400，不修改文件。
    "page=1.5",
    // 测试值：pageSize=101；预期：400，超过最大每页 100 条，不修改文件。
    "pageSize=101",
  ]) {
    /** 每项非法参数是独立用例，前置申请为空；除 400 外验证文件完全未变。 */
    it(`拒绝非法参数 ${query}`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      assert.equal(
        (await api.request(`/purchase-applications?${query}`)).status,
        400,
      );
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
});
