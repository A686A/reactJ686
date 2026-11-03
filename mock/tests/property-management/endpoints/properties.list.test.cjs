const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createApiContext } = require("../../shared/helpers/apiTestContext.cjs");

describe("GET /api/v1/properties", () => {
  /**
   * 接口：GET /api/v1/properties。
   * 前置：property-1 在售/500万元/100㎡，property-2 待上架/200万元/50㎡，property-3 已售/800万元/180㎡，更新时间依次递增。
   * 测试值：不传查询参数。
   * 预期：200，page=1、pageSize=8、total=3，ID顺序[3,2,1]；summary={total:3,forSale:1,sold:1,totalPrice:1500}。
   */
  it("返回默认分页、稳定顺序和全库统计", async (t) => {
    const api = await createApiContext(t);
    const { status, data } = await api.request("/properties");
    assert.equal(status, 200);
    assert.equal(data.page, 1);
    assert.equal(data.pageSize, 8);
    assert.deepEqual(
      data.items.map((row) => row.id),
      ["property-3", "property-2", "property-1"],
    );
    assert.equal(data.total, 3);
    assert.deepEqual(data.summary, {
      total: 3,
      forSale: 1,
      sold: 1,
      totalPrice: 1500,
    });
  });
  /**
   * 接口：GET /api/v1/properties。
   * 前置：默认三条房源。测试值：page=2、pageSize=2。
   * 预期：200、total=3、page=2、pageSize=2，仅返回 property-1。
   */
  it("第二页仅返回当前页记录而不改变总数", async (t) => {
    const api = await createApiContext(t);
    const { status, data } = await api.request("/properties?page=2&pageSize=2");
    assert.equal(status, 200);
    assert.equal(data.total, 3);
    assert.equal(data.page, 2);
    assert.equal(data.pageSize, 2);
    assert.deepEqual(
      data.items.map((row) => row.id),
      ["property-1"],
    );
  });
  /**
   * 接口：GET /api/v1/properties。
   * 前置：默认三条房源。测试值：keyword=杭州、type=公寓、status=待上架。
   * 预期：200，仅返回 property-2，total=1，但summary.total=3。
   */
  it("关键词、类型及状态组合筛选，统计仍保持全库口径", async (t) => {
    const api = await createApiContext(t);
    const query = new URLSearchParams({
      keyword: "杭州",
      type: "公寓",
      status: "待上架",
    });
    const { status, data } = await api.request(`/properties?${query}`);
    assert.equal(status, 200);
    assert.deepEqual(
      data.items.map((row) => row.id),
      ["property-2"],
    );
    assert.equal(data.total, 1);
    assert.equal(data.summary.total, 3);
  });
  /**
   * 接口：GET /api/v1/properties。
   * 前置：默认三条房源。测试值：keyword=missing。
   * 预期：200、items=[]、total=0，不因无结果返回404。
   */
  it("关键词不匹配时返回空列表", async (t) => {
    const api = await createApiContext(t);
    const { status, data } = await api.request("/properties?keyword=missing");
    assert.equal(status, 200);
    assert.deepEqual(data.items, []);
    assert.equal(data.total, 0);
  });
  for (const [label, query, expected] of [
    // 测试值：sort=price、order=asc；预期200，ID顺序[property-2,property-1,property-3]。
    [
      "总价升序",
      "sort=price&order=asc",
      ["property-2", "property-1", "property-3"],
    ],
    // 测试值：sort=price、order=desc；预期200，ID顺序[property-3,property-1,property-2]。
    [
      "总价降序",
      "sort=price&order=desc",
      ["property-3", "property-1", "property-2"],
    ],
    // 测试值：sort=area、order=asc；预期200，ID顺序[property-2,property-1,property-3]。
    [
      "面积升序",
      "sort=area&order=asc",
      ["property-2", "property-1", "property-3"],
    ],
  ]) {
    /** 每种排序单独启动服务，断言准确 ID 顺序，避免只检查返回了三条。 */
    it(label, async (t) => {
      const api = await createApiContext(t);
      const { status, data } = await api.request(`/properties?${query}`);
      assert.equal(status, 200);
      assert.deepEqual(
        data.items.map((row) => row.id),
        expected,
      );
    });
  }
  // 每项为独立GET用例：page=0/abc、pageSize=101/-1、sort/order/status/type=invalid均预期400，文件不变。
  for (const query of [
    // 独立用例：GET /properties?page=0；预期 HTTP 400、错误消息非空、持久化数据不变。
    "page=0",
    // 独立用例：GET /properties?page=abc；预期 HTTP 400、错误消息非空、持久化数据不变。
    "page=abc",
    // 独立用例：GET /properties?pageSize=101；预期 HTTP 400、错误消息非空、持久化数据不变。
    "pageSize=101",
    // 独立用例：GET /properties?pageSize=-1；预期 HTTP 400、错误消息非空、持久化数据不变。
    "pageSize=-1",
    // 独立用例：GET /properties?sort=invalid；预期 HTTP 400、错误消息非空、持久化数据不变。
    "sort=invalid",
    // 独立用例：GET /properties?order=invalid；预期 HTTP 400、错误消息非空、持久化数据不变。
    "order=invalid",
    // 独立用例：GET /properties?status=invalid；预期 HTTP 400、错误消息非空、持久化数据不变。
    "status=invalid",
    // 独立用例：GET /properties?type=invalid；预期 HTTP 400、错误消息非空、持久化数据不变。
    "type=invalid",
  ]) {
    /** 每个非法查询参数独立断言 400，并确认没有写入数据。 */
    it(`拒绝非法参数 ${query}`, async (t) => {
      const api = await createApiContext(t);
      const before = await api.readDatabase();
      const response = await api.request(`/properties?${query}`);
      assert.equal(response.status, 400);
      assert.ok(response.data.message);
      assert.deepEqual(await api.readDatabase(), before);
    });
  }
});
