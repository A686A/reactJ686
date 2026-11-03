const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createApiContext } = require("../helpers/apiTestContext.cjs");
const { buildPropertyPayload } = require("../helpers/fixtures.cjs");

describe("POST /api/v1/properties", () => {
  /**
   * 接口：POST /api/v1/properties。
   * 前置：默认三条房源。测试值：合法房源字段见buildPropertyPayload；name="  新增测试房源  "，伪造id=forged-id、code=forged-code、version=99、createdAt=forged-time。
   * 预期：201，名称去空格，ID不是forged-id、编号以RE-开头、version=1、创建时间合法；文件有4条，新增记录与响应一致。
   */
  it("创建、修整文本并忽略客户端伪造的系统字段", async (t) => {
    const api = await createApiContext(t);
    const response = await api.request("/properties", {
      method: "POST",
      payload: buildPropertyPayload({
        name: "  新增测试房源  ",
        id: "forged-id",
        code: "forged-code",
        version: 99,
        createdAt: "forged-time",
      }),
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.name, "新增测试房源");
    assert.notEqual(response.data.id, "forged-id");
    assert.match(response.data.code, /^RE-/);
    assert.equal(response.data.version, 1);
    assert.ok(Number.isFinite(Date.parse(response.data.createdAt)));
    const database = await api.readDatabase();
    assert.equal(database.properties.length, 4);
    assert.deepEqual(
      database.properties.find((row) => row.id === response.data.id),
      response.data,
    );
  });
  const invalid = [
    // 以下字段用例均调用POST /properties，未列字段使用buildPropertyPayload合法基线。
    // 名称name=""→422/fields.name；城市city=""→422/fields.city；联系人contact=""→422/fields.contact。
    // 独立用例「名称为空」：POST /properties，覆盖测试值 { name: "" }；其余为合法基线。预期 HTTP 422、fields.name 非空、持久化数据不变。
    ["名称为空", { name: "" }, "name"],
    // 独立用例「城市为空」：POST /properties，覆盖测试值 { city: "" }；其余为合法基线。预期 HTTP 422、fields.city 非空、持久化数据不变。
    ["城市为空", { city: "" }, "city"],
    // 独立用例「联系人缺失」：POST /properties，覆盖测试值 { contact: "" }；其余为合法基线。预期 HTTP 422、fields.contact 非空、持久化数据不变。
    ["联系人缺失", { contact: "" }, "contact"],
    // area=0→422/fields.area；area=1000001→422/fields.area；price=-1→422/fields.price。
    // 独立用例「面积为零」：POST /properties，覆盖测试值 { area: 0 }；其余为合法基线。预期 HTTP 422、fields.area 非空、持久化数据不变。
    ["面积为零", { area: 0 }, "area"],
    // 独立用例「面积超界」：POST /properties，覆盖测试值 { area: 1000001 }；其余为合法基线。预期 HTTP 422、fields.area 非空、持久化数据不变。
    ["面积超界", { area: 1000001 }, "area"],
    // 独立用例「价格为负」：POST /properties，覆盖测试值 { price: -1 }；其余为合法基线。预期 HTTP 422、fields.price 非空、持久化数据不变。
    ["价格为负", { price: -1 }, "price"],
    // price="388"字符串→422/fields.price；rooms=2.5→422/fields.rooms，房间数须为整数。
    // 独立用例「金额传字符串」：POST /properties，覆盖测试值 { price: "388" }；其余为合法基线。预期 HTTP 422、fields.price 非空、持久化数据不变。
    ["金额传字符串", { price: "388" }, "price"],
    // 独立用例「房间数不是整数」：POST /properties，覆盖测试值 { rooms: 2.5 }；其余为合法基线。预期 HTTP 422、fields.rooms 非空、持久化数据不变。
    ["房间数不是整数", { rooms: 2.5 }, "rooms"],
    // type=invalid→422/fields.type；status=invalid→422/fields.status。
    // 独立用例「类型非法」：POST /properties，覆盖测试值 { type: "invalid" }；其余为合法基线。预期 HTTP 422、fields.type 非空、持久化数据不变。
    ["类型非法", { type: "invalid" }, "type"],
    // 独立用例「状态非法」：POST /properties，覆盖测试值 { status: "invalid" }；其余为合法基线。预期 HTTP 422、fields.status 非空、持久化数据不变。
    ["状态非法", { status: "invalid" }, "status"],
    // phone=abc→422/fields.phone；name为81个“房”→422/fields.name；description为1001个“字”→422/fields.description。
    // 独立用例「电话非法」：POST /properties，覆盖测试值 { phone: "abc" }；其余为合法基线。预期 HTTP 422、fields.phone 非空、持久化数据不变。
    ["电话非法", { phone: "abc" }, "phone"],
    // 独立用例「名称超长」：POST /properties，覆盖测试值 { name: "房".repeat(81) }；其余为合法基线。预期 HTTP 422、fields.name 非空、持久化数据不变。
    ["名称超长", { name: "房".repeat(81) }, "name"],
    // 独立用例「备注超长」：POST /properties，覆盖测试值 { description: "字".repeat(1001) }；其余为合法基线。预期 HTTP 422、fields.description 非空、持久化数据不变。
    ["备注超长", { description: "字".repeat(1001) }, "description"],
  ];
  for (const [label, overrides, field] of invalid) {
    /** 每次只改变一个字段；断言字段级错误及持久化文件完全未变。 */
    it(`422：${label}`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      const response = await api.request("/properties", {
        method: "POST",
        payload: buildPropertyPayload(overrides),
      });
      assert.equal(response.status, 422);
      assert.ok(response.data.fields[field]);
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  // 两个独立POST用例：JSON null、JSON []均预期422，因请求体不是业务对象；原文件不变。
  for (const payload of [null, []]) {
    it(`拒绝非对象请求体 ${JSON.stringify(payload)}`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      assert.equal(
        (await api.request("/properties", { method: "POST", payload })).status,
        422,
      );
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
  for (const [label, options, expected] of [
    // 原始请求体{bad→400；合法字段+text/plain→415；description为70000个ASCII字符、请求超过65536字节→413。所有失败均不写入文件。
    // 独立用例「非法 JSON」：POST /properties，测试选项 { rawBody: "{bad" }；预期 HTTP 400，持久化数据不变。
    ["非法 JSON", { rawBody: "{bad" }, 400],
    // 独立用例「错误内容类型」：POST /properties，测试选项 { payload: buildPropertyPayload(), contentType: "text/plain" }；预期 HTTP 415，持久化数据不变。
    [
      "错误内容类型",
      { payload: buildPropertyPayload(), contentType: "text/plain" },
      415,
    ],
    // 独立用例「请求体超过 64 KiB」：POST /properties，测试选项 { payload: buildPropertyPayload({ description: "x".repeat(70000) }) }；预期 HTTP 413，持久化数据不变。
    [
      "请求体超过 64 KiB",
      { payload: buildPropertyPayload({ description: "x".repeat(70000) }) },
      413,
    ],
  ]) {
    it(`拒绝${label}`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      assert.equal(
        (await api.request("/properties", { method: "POST", ...options }))
          .status,
        expected,
      );
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
});
