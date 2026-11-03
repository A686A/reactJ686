/**
 * 申请房源基线：id=1、code=RE-001、name=申请测试房源、version=3、price=600万元、status=在售。
 * 每次构造新对象；overrides只覆盖当前场景需要改变的字段。
 */
export function createSelectablePropertyFixture(overrides = {}) {
  return {
    id: "1",
    version: 3,
    code: "RE-001",
    name: "申请测试房源",
    city: "上海",
    district: "浦东新区",
    address: "模拟地址",
    area: 100,
    price: 600,
    status: "在售",
    ...overrides,
  };
}

/**
 * 审批申请基线：id=pa-1、code=PA-001、version=1、status=待审核；买方=模拟买方、成交580万元、定金20万元，保留一条提交历史。
 * 每次构造新对象；overrides只覆盖当前场景需要改变的字段。
 */
export function createPurchaseApplicationFixture(overrides = {}) {
  return {
    id: "pa-1",
    code: "PA-001",
    version: 1,
    status: "待审核",
    propertySnapshot: {
      name: "审核测试房源",
      code: "RE-001",
      city: "上海",
      district: "浦东新区",
      address: "模拟地址",
      area: 100,
      price: 600,
    },
    buyerName: "模拟买方",
    buyerPhone: "13800138000",
    dealPrice: 580,
    deposit: 20,
    paymentMethod: "全款",
    expectedSigningDate: "2027-01-15",
    history: [
      {
        id: "h1",
        action: "提交申请",
        actor: "演示申请人",
        comment: "",
        createdAt: "2026-11-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

/**
 * 申请输入基线：买方=模拟买方、电话=13800138000、成交="580"、定金="20"、预计签约=2027-01-15。
 * 每次构造新对象；overrides只覆盖当前场景需要改变的字段。
 */
export function createPurchaseApplicationFormValues(overrides = {}) {
  return {
    买方姓名: "模拟买方",
    联系电话: "13800138000",
    "成交总价（万元）": "580",
    "意向定金（万元）": "20",
    预计签约日期: "2027-01-15",
    ...overrides,
  };
}
