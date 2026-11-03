const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createPropertyApiContext: createApiContext,
} = require("../helpers/propertyApiContext.cjs");
const { buildProperty } = require("../fixtures/propertyApiFixtures.cjs");

describe("GET /api/v1/properties/:id", () => {
  /**
   * 接口：GET /api/v1/properties/:id。
   * 前置：仅一条buildProperty默认房源，id=property-1、version=1、price=500万元。
   * 测试值：路径id=property-1。预期：200，响应所有字段与完整前置房源深度相等。
   */
  it("返回指定房源的完整详情及版本", async (t) => {
    const property = buildProperty();
    const api = await createApiContext(t, { properties: [property] });
    const { status, data } = await api.request(`/properties/${property.id}`);
    assert.equal(status, 200);
    assert.deepEqual(data, property);
  });
  /**
   * 接口：GET /api/v1/properties/:id。
   * 前置：properties=[]，不依赖删除接口。测试值：路径id=missing。
   * 预期：404，message包含“不存在”，不创建房源。
   */
  it("不存在或已删除的 ID 返回 404", async (t) => {
    const api = await createApiContext(t, { properties: [] });
    const response = await api.request("/properties/missing");
    assert.equal(response.status, 404);
    assert.match(response.data.message, /不存在/);
  });
});
