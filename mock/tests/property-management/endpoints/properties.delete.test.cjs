const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createApiContext } = require("../../shared/helpers/apiTestContext.cjs");
const {
  buildProperty,
  buildApplication,
} = require("../../shared/helpers/fixtures.cjs");

describe("DELETE /api/v1/properties/:id", () => {
  /**
   * 接口：DELETE /api/v1/properties/property-1。
   * 前置：property-1、property-2和历史申请application-1。测试值：JSON请求体{version:1}。
   * 预期：204，响应文本为空、解析data=null；文件仅保留property-2，申请application-1不变。
   */
  it("删除指定版本，保留其他房源及历史申请", async (t) => {
    const application = buildApplication();
    const api = await createApiContext(t, {
      properties: [buildProperty(), buildProperty({ id: "property-2" })],
      purchaseApplications: [application],
    });
    const response = await api.request("/properties/property-1", {
      method: "DELETE",
      payload: { version: 1 },
    });
    assert.equal(response.status, 204);
    assert.equal(response.text, "");
    assert.equal(response.data, null);
    const stored = await api.readDatabase();
    assert.deepEqual(
      stored.properties.map((row) => row.id),
      ["property-2"],
    );
    assert.deepEqual(stored.purchaseApplications, [application]);
  });
  for (const [label, route, payload, expected] of [
    // DELETE路径/properties/missing、version1→404；路径/property-1、version99→409；请求体{}未传版本→409。所有失败不删除任何记录。
    // 独立用例「不存在的房源」：DELETE /properties/missing，测试体 { version: 1 }。预期 HTTP 404，数据库不变。
    ["不存在的房源", "/properties/missing", { version: 1 }, 404],
    // 独立用例「旧版本」：DELETE /properties/property-1，测试体 { version: 99 }。预期 HTTP 409，数据库不变。
    ["旧版本", "/properties/property-1", { version: 99 }, 409],
    // 独立用例「缺少版本」：DELETE /properties/property-1，测试体 {}。预期 HTTP 409，数据库不变。
    ["缺少版本", "/properties/property-1", {}, 409],
  ]) {
    it(`拒绝删除${label}且不修改数据`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      assert.equal(
        (await api.request(route, { method: "DELETE", payload })).status,
        expected,
      );
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  /**
   * 接口：DELETE /api/v1/properties/property-1。
   * 前置：默认三条房源。测试值：{version:1}，Content-Type=text/plain。
   * 预期：415，所有持久化数据保持原样。
   */
  it("错误内容类型返回 415，不删除房源", async (t) => {
    const api = await createApiContext(t);
    const before = await api.readDatabase();
    assert.equal(
      (
        await api.request("/properties/property-1", {
          method: "DELETE",
          payload: { version: 1 },
          contentType: "text/plain",
        })
      ).status,
      415,
    );
    assert.deepEqual(await api.readDatabase(), before);
  });
});
