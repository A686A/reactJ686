const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createApiContext } = require("../helpers/apiTestContext.cjs");
const {
  buildApplicationPayload,
  buildProperty,
} = require("../helpers/fixtures.cjs");

describe("POST /api/v1/purchase-applications", () => {
  /** 测试内容：首次有效提交。测试值：房源 property-1/version=1，买方=测试买方，成交价480、定金20万元；伪造 status=已通过、version=99。预期：201，后端生成 ID/PA 编号，状态待审核、版本1、提交记录1条；房源仍在售且价格500万元。 */
  it("创建待审核申请和快照，不接受伪造系统字段", async (t) => {
    const api = await createApiContext(t);
    const before = await api.readDatabase();
    const { status, data } = await api.request("/purchase-applications", {
      method: "POST",
      payload: buildApplicationPayload({
        id: "forged",
        status: "已通过",
        version: 99,
      }),
    });
    assert.equal(status, 201);
    assert.notEqual(data.id, "forged");
    assert.match(data.code, /^PA-/);
    assert.equal(data.status, "待审核");
    assert.equal(data.version, 1);
    assert.equal(data.history.length, 1);
    assert.equal(data.history[0].action, "提交申请");
    assert.equal(data.propertySnapshot.id, "property-1");
    assert.equal(data.propertySnapshot.price, 500);
    assert.equal(data.dealPrice, 480);
    assert.equal(Object.hasOwn(data, "submissionKey"), false);
    const database = await api.readDatabase();
    assert.equal(database.purchaseApplications.length, 1);
    assert.equal(database.purchaseApplications[0].id, data.id);
    assert.deepEqual(database.properties, before.properties);
  });
  const invalid = [
    // 测试值：propertyId=''；预期：422，fields.propertyId 非空，文件不变。
    ["未选择房源", { propertyId: "" }, "propertyId"],
    // 测试值：buyerName=''；预期：422，fields.buyerName 非空，文件不变。
    ["买方姓名缺失", { buyerName: "" }, "buyerName"],
    // 测试值：buyerPhone='abc'；预期：422，fields.buyerPhone 非空。
    ["电话非法", { buyerPhone: "abc" }, "buyerPhone"],
    // 测试值：dealPrice=0 万元；预期：422，fields.dealPrice 非空。
    ["成交价为零", { dealPrice: 0 }, "dealPrice"],
    // 测试值：dealPrice='480' 字符串；预期：422，不能依赖自动类型转换。
    ["成交价类型错误", { dealPrice: "480" }, "dealPrice"],
    // 测试值：deposit=-1 万元；预期：422，fields.deposit 非空。
    ["定金为负", { deposit: -1 }, "deposit"],
    // 测试值：deposit=481、dealPrice=480 万元；预期：422，定金不可超过总价。
    ["定金超过总价", { deposit: 481 }, "deposit"],
    // 测试值：paymentMethod='invalid'；预期：422，fields.paymentMethod 非空。
    ["付款方式非法", { paymentMethod: "invalid" }, "paymentMethod"],
    // 测试值：expectedSigningDate='2027-02-30'；预期：422，不接受日期自动顺延。
    [
      "日期不存在",
      { expectedSigningDate: "2027-02-30" },
      "expectedSigningDate",
    ],
    // 测试值：propertyVersion=0；预期：422，fields.propertyId 提示重新选择。
    ["房源版本格式非法", { propertyVersion: 0 }, "propertyId"],
    // 测试值：submissionKey=''；预期：422，必须提供去重标识。
    ["提交标识缺失", { submissionKey: "" }, "submissionKey"],
    // 测试值：remarks 为1001个字；预期：422，超过1000字上限。
    ["备注超长", { remarks: "字".repeat(1001) }, "remarks"],
  ];
  for (const [label, overrides, field] of invalid) {
    /** 其他输入沿用合法基线（房源版本1、成交480、定金20）；单字段错误不得创建任何申请。 */
    it(`422：${label}`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      const response = await api.request("/purchase-applications", {
        method: "POST",
        payload: buildApplicationPayload(overrides),
      });
      assert.equal(response.status, 422);
      assert.ok(response.data.fields[field]);
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  for (const status of ["待上架", "已售", "已下架"]) {
    /** 测试值：房源状态依次为待上架/已售/已下架，其余申请字段有效；预期：409，字段错误指向 propertyId，不写入申请。 */
    it(`拒绝申请${status}房源`, async (t) => {
      const api = await createApiContext(t, {
        properties: [buildProperty({ status })],
      });
      const before = await api.readDatabase();
      const response = await api.request("/purchase-applications", {
        method: "POST",
        payload: buildApplicationPayload(),
      });
      assert.equal(response.status, 409);
      assert.ok(response.data.fields.propertyId);
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  for (const [label, overrides] of [
    // 测试值：propertyId=missing；预期：409，目标房源不存在。
    ["房源不存在", { propertyId: "missing" }],
    // 测试值：propertyVersion=99、当前房源version=1；预期：409，版本冲突。
    ["房源版本过期", { propertyVersion: 99 }],
  ]) {
    it(`409：${label}`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      const response = await api.request("/purchase-applications", {
        method: "POST",
        payload: buildApplicationPayload(overrides),
      });
      assert.equal(response.status, 409);
      assert.ok(response.data.fields.propertyId);
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  /** 测试内容：同一接口的一次场景内原样重试。测试值：两次均submissionKey=submission-test-1、成交480。预期：第一次201，第二次200、相同ID，文件中仅1份申请和1条提交历史。 */
  it("相同提交键及内容重试不重复建单", async (t) => {
    const api = await createApiContext(t);
    const payload = buildApplicationPayload();
    const first = await api.request("/purchase-applications", {
      method: "POST",
      payload,
    });
    const second = await api.request("/purchase-applications", {
      method: "POST",
      payload,
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.data.id, first.data.id);
    const database = await api.readDatabase();
    assert.equal(database.purchaseApplications.length, 1);
    assert.equal(database.purchaseApplications[0].history.length, 1);
  });
  /** 测试内容：同一键搭配不同内容。测试值：先成交480，后成交600，均submission-test-1。预期：第二次409，文件不变，原成交价仍480。 */
  it("同一提交键变更内容返回冲突", async (t) => {
    const api = await createApiContext(t);
    await api.request("/purchase-applications", {
      method: "POST",
      payload: buildApplicationPayload(),
    });
    const before = await api.readDatabase();
    const response = await api.request("/purchase-applications", {
      method: "POST",
      payload: buildApplicationPayload({ dealPrice: 600 }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await api.readDatabase(), before);
  });
  for (const [label, options, expected] of [
    // 测试值：请求体null；预期422，非对象输入不可提交。
    ["非对象请求体", { payload: null }, 422],
    // 测试值：原始JSON文本'{bad'；预期400。
    ["非法 JSON", { rawBody: "{bad" }, 400],
    // 测试值：合法申请+Content-Type=text/plain；预期415。
    [
      "错误内容类型",
      { payload: buildApplicationPayload(), contentType: "text/plain" },
      415,
    ],
  ]) {
    /** 前置申请集合为空；所有负面请求完成后，房源和申请文件都必须原样保留。 */
    it(`拒绝${label}`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      assert.equal(
        (
          await api.request("/purchase-applications", {
            method: "POST",
            ...options,
          })
        ).status,
        expected,
      );
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
});
