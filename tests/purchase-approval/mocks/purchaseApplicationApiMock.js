/* global jest */

/**
 * 为购房申请与审批组件提供模块专用API替身；不预设成功或失败。
 * 每个case在测试文件内显式指定mockResolvedValue或mockRejectedValue，便于阅读场景。
 */
export function createPurchaseApplicationApiMock() {
  return {
    purchaseApplicationApi: {
      getList: jest.fn(),
      getById: jest.fn(),
      submitApplication: jest.fn(),
      submitApproval: jest.fn(),
    },
  };
}
