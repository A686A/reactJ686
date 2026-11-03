const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createApiContext } = require("../../shared/helpers/apiTestContext.cjs");
const {
  buildApplication,
  buildProperty,
} = require("../../shared/helpers/fixtures.cjs");

describe("GET /api/v1/purchase-applications/:id", () => {
  /** 测试内容：详情正确性。测试值：预置 application-1，买方=测试买方，成交价=480 万元。预期：200，返回该 ID、版本 1、待审核状态、480 总价及一条提交历史；不改数据。 */
  it("查询完整申请和流程历史", async (t) => {
    const application = buildApplication();
    const api = await createApiContext(t, {
      purchaseApplications: [application],
    });
    const before = await api.readDatabase();
    const { status, data } = await api.request(
      "/purchase-applications/application-1",
    );
    assert.equal(status, 200);
    const { submissionKey, ...expected } = application;
    assert.deepEqual(data, expected);
    assert.deepEqual(await api.readDatabase(), before);
  });
  /** 测试内容：缺失记录。测试值：空申请集合，id=missing。预期：404，错误消息表明不存在，不创建申请。 */
  it("申请不存在返回 404", async (t) => {
    const api = await createApiContext(t);
    const response = await api.request("/purchase-applications/missing");
    assert.equal(response.status, 404);
    assert.match(response.data.message, /不存在/);
    assert.deepEqual((await api.readDatabase()).purchaseApplications, []);
  });
  /** 测试内容：历史快照隔离。测试值：当前房源名称改为“当前新名称”，申请快照仍为“滨江测试房源”。预期：200，返回旧快照名称而非当前房源。 */
  it("当前房源变化不改写申请时快照", async (t) => {
    const api = await createApiContext(t, {
      properties: [buildProperty({ name: "当前新名称" })],
      purchaseApplications: [buildApplication()],
    });
    const { status, data } = await api.request(
      "/purchase-applications/application-1",
    );
    assert.equal(status, 200);
    assert.equal(data.propertySnapshot.name, "滨江测试房源");
  });
  /** 测试内容：原房源删除后仍可查历史。测试值：properties=[]，保留 application-1。预期：200，快照 id=property-1、名称=滨江测试房源。 */
  it("房源已删除仍可查询申请资料", async (t) => {
    const api = await createApiContext(t, {
      properties: [],
      purchaseApplications: [buildApplication()],
    });
    const { status, data } = await api.request(
      "/purchase-applications/application-1",
    );
    assert.equal(status, 200);
    assert.equal(data.propertySnapshot.id, "property-1");
    assert.equal(data.propertySnapshot.name, "滨江测试房源");
  });
});
