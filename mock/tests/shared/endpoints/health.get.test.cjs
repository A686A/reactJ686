const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createApiContext } = require("../helpers/apiTestContext.cjs");

describe("GET /api/v1/health", () => {
  /**
   * 接口：GET /api/v1/health。
   * 测试值：使用默认三条房源、空申请集合，不传查询参数或请求体。
   * 预期：HTTP 200，JSON 恰为 {status:"ok"}，Content-Type 包含 application/json，X-Request-Id 为非空字符串。
   */
  it("返回健康状态、JSON 类型及请求追踪 ID", async (t) => {
    const api = await createApiContext(t);
    const response = await api.request("/health");
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { status: "ok" });
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.ok(response.headers.get("x-request-id"));
  });
  /**
   * 接口：GET /api/v1/does-not-exist（路由不存在的负面场景）。
   * 测试值：无请求体。
   * 预期：HTTP 404，fields={}，响应体 requestId 与 X-Request-Id 一致，不返回前端 HTML。
   */
  it("未知地址返回 404 和关联追踪 ID", async (t) => {
    const api = await createApiContext(t);
    const response = await api.request("/does-not-exist");
    assert.equal(response.status, 404);
    assert.equal(response.data.requestId, response.headers.get("x-request-id"));
    assert.deepEqual(response.data.fields, {});
  });
});
