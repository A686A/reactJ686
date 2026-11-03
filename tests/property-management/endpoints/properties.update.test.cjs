const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createPropertyApiContext: createApiContext,
} = require("../helpers/propertyApiContext.cjs");
const {
  buildProperty,
  buildPropertyPayload,
} = require("../fixtures/propertyApiFixtures.cjs");
const {
  buildApplication,
} = require("../../purchase-approval/fixtures/purchaseApiFixtures.cjs");

describe("PUT /api/v1/properties/:id", () => {
  /**
   * 接口：PUT /api/v1/properties/property-1。
   * 前置：房源version=1，已有application-1申请。测试值：name=已修改房源、price=600万元、version=1，另伪造id/code/createdAt=forged。
   * 预期：200、name及price更新、version=2、updatedAt变新；id/code/createdAt保持原值，持久化房源等于响应且原申请完全保留。
   */
  it("更新业务字段、递增版本并保留系统字段和已有申请", async (t) => {
    const original = buildProperty(),
      application = buildApplication();
    const api = await createApiContext(t, {
      properties: [original],
      purchaseApplications: [application],
    });
    const response = await api.request("/properties/property-1", {
      method: "PUT",
      payload: buildPropertyPayload({
        name: "已修改房源",
        price: 600,
        version: 1,
        id: "forged",
        code: "forged",
        createdAt: "forged",
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.name, "已修改房源");
    assert.equal(response.data.price, 600);
    assert.equal(response.data.version, 2);
    assert.equal(response.data.id, original.id);
    assert.equal(response.data.code, original.code);
    assert.equal(response.data.createdAt, original.createdAt);
    assert.ok(
      Date.parse(response.data.updatedAt) > Date.parse(original.updatedAt),
    );
    const stored = await api.readDatabase();
    assert.deepEqual(stored.properties[0], response.data);
    assert.deepEqual(stored.purchaseApplications, [application]);
  });
  const cases = [
    // 路径/properties/missing，合法字段+version1→404；路径/property-1，version9→409；不传version→409。
    // 独立用例「房源不存在」：PUT /properties/missing，测试体 buildPropertyPayload({ version: 1 })。预期 HTTP 404，数据库与请求前深度相等。
    [
      "房源不存在",
      "/properties/missing",
      buildPropertyPayload({ version: 1 }),
      404,
    ],
    // 独立用例「版本过期」：PUT /properties/property-1，测试体 buildPropertyPayload({ version: 9 })。预期 HTTP 409，数据库与请求前深度相等。
    [
      "版本过期",
      "/properties/property-1",
      buildPropertyPayload({ version: 9 }),
      409,
    ],
    // 独立用例「未传版本」：PUT /properties/property-1，测试体 buildPropertyPayload()。预期 HTTP 409，数据库与请求前深度相等。
    ["未传版本", "/properties/property-1", buildPropertyPayload(), 409],
    // 路径/properties/property-1，version1：name=""→422；area=-1→422；price=0→422。每个失败用例文件必须完全不变。
    // 独立用例「名称为空」：PUT /properties/property-1，测试体 buildPropertyPayload({ name: "", version: 1 })。预期 HTTP 422，数据库与请求前深度相等。
    [
      "名称为空",
      "/properties/property-1",
      buildPropertyPayload({ name: "", version: 1 }),
      422,
    ],
    // 独立用例「面积非法」：PUT /properties/property-1，测试体 buildPropertyPayload({ area: -1, version: 1 })。预期 HTTP 422，数据库与请求前深度相等。
    [
      "面积非法",
      "/properties/property-1",
      buildPropertyPayload({ area: -1, version: 1 }),
      422,
    ],
    // 独立用例「价格非法」：PUT /properties/property-1，测试体 buildPropertyPayload({ price: 0, version: 1 })。预期 HTTP 422，数据库与请求前深度相等。
    [
      "价格非法",
      "/properties/property-1",
      buildPropertyPayload({ price: 0, version: 1 }),
      422,
    ],
  ];
  for (const [label, route, payload, expected] of cases) {
    /** 所有失败分支同时核对无副作用，不能返回错误却写坏原数据。 */
    it(`拒绝${label}且保持原记录`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      assert.equal(
        (await api.request(route, { method: "PUT", payload })).status,
        expected,
      );
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  /**
   * 接口：PUT /api/v1/properties/property-1。
   * 前置：默认三条房源。测试值：原始请求体="{bad"，Content-Type=application/json。
   * 预期：400，文件中的房源、版本和申请集合完全不变。
   */
  it("请求 JSON 格式错误返回 400", async (t) => {
    const api = await createApiContext(t);
    const before = await api.readDatabase();
    assert.equal(
      (
        await api.request("/properties/property-1", {
          method: "PUT",
          rawBody: "{bad",
        })
      ).status,
      400,
    );
    assert.deepEqual(await api.readDatabase(), before);
  });
});
