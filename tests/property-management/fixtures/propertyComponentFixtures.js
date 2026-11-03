/**
 * 前端房源基线：id=1、name=测试房源、area=100㎡、price=500万元、version=1；其余字段见下方固定数据。
 * 每次构造新对象；overrides只覆盖当前场景需要改变的字段。
 */
export function createPropertyFixture(overrides = {}) {
  return {
    id: "1",
    code: "RE-001",
    name: "测试房源",
    city: "上海",
    district: "浦东新区",
    address: "测试路1号",
    type: "住宅",
    status: "在售",
    area: 100,
    price: 500,
    rooms: 3,
    contact: "林经理",
    phone: "13800138000",
    description: "",
    version: 1,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * 房源输入基线：名称=新增房源示例、城市=杭州、area="88"、price="300"、rooms="2"；保留字符串以验证表单转换。
 * 每次构造新对象；overrides只覆盖当前场景需要改变的字段。
 */
export function createPropertyFormValues(overrides = {}) {
  return {
    房源名称: "新增房源示例",
    城市: "杭州",
    区域: "滨江区",
    详细地址: "江南大道1号",
    "建筑面积（㎡）": "88",
    "总价（万元）": "300",
    房间数: "2",
    联系人: "王经理",
    联系电话: "13900139000",
    ...overrides,
  };
}
