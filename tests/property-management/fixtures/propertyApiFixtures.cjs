/**
 * 为独立接口测试生成有效房源，每次返回新对象，避免用例间共享可变状态。
 * 默认值：id=property-1、code=RE-TEST-001、name=滨江测试房源、city=上海、district=浦东新区、address=测试路1号。
 * type=住宅、status=在售、area=100㎡、price=500万元、rooms=3、contact=模拟经理、phone=13800138000、description=""。
 * version=1，createdAt=2026-01-01T00:00:00.000Z、updatedAt=2026-01-02T00:00:00.000Z。
 * @param {object} overrides 当前场景需要覆盖的字段。
 * @returns {object} 带系统字段和版本的完整房源。
 */
function buildProperty(overrides = {}) {
  return {
    id: "property-1",
    code: "RE-TEST-001",
    name: "滨江测试房源",
    city: "上海",
    district: "浦东新区",
    address: "测试路1号",
    type: "住宅",
    status: "在售",
    area: 100,
    price: 500,
    rooms: 3,
    contact: "模拟经理",
    phone: "13800138000",
    description: "",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * 返回三条可区分的房源，其余字段继承 buildProperty 的注释基线。
 * 第1条：完整使用 property-1 基线，在售、500万元、100㎡、更新时间2026-01-02。
 * 第2条：id=property-2、code=RE-TEST-002、name=西湖测试公寓、city=杭州、district=西湖区，
 * type=公寓、status=待上架、price=200万元、area=50㎡、更新时间2026-01-03。
 * 第3条：id=property-3、code=RE-TEST-003、name=滨江已售房源、status=已售，
 * price=800万元、area=180㎡、更新时间2026-01-04；其他地址及联系人仍用基线。
 */
function buildPropertyCollection() {
  return [
    buildProperty(),
    buildProperty({
      id: "property-2",
      code: "RE-TEST-002",
      name: "西湖测试公寓",
      city: "杭州",
      district: "西湖区",
      type: "公寓",
      status: "待上架",
      price: 200,
      area: 50,
      updatedAt: "2026-01-03T00:00:00.000Z",
    }),
    buildProperty({
      id: "property-3",
      code: "RE-TEST-003",
      name: "滨江已售房源",
      status: "已售",
      price: 800,
      area: 180,
      updatedAt: "2026-01-04T00:00:00.000Z",
    }),
  ];
}

/**
 * 返回只含业务字段的合法新增请求，不调用生产转换函数。
 * 基线：name=新增测试房源、city=上海、district=浦东新区、address=新增路2号、type=住宅、status=在售。
 * area=88.5㎡、price=388万元、rooms=2、contact=模拟经理、phone=13900139000、description=接口测试。
 * 每项非法字段用例只覆盖注明的字段；未注明字段均取本基线。
 */
function buildPropertyPayload(overrides = {}) {
  return {
    name: "新增测试房源",
    city: "上海",
    district: "浦东新区",
    address: "新增路2号",
    type: "住宅",
    status: "在售",
    area: 88.5,
    price: 388,
    rooms: 2,
    contact: "模拟经理",
    phone: "13900139000",
    description: "接口测试",
    ...overrides,
  };
}
module.exports = {
  buildProperty,
  buildPropertyCollection,
  buildPropertyPayload,
};
