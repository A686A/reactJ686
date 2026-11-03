/* global jest */

/** 仅替换API调用边界，页面、校验、Hook及用户交互仍执行真实代码。 */
export function createPropertyApiMock() {
  return {
    propertyApi: {
      getList: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

/**
 * 每个用例创建独立内存记录并配置CRUD响应，防止修改在用例之间串扰。
 * @param {object} propertyApi 已由Jest替换的API对象。
 * @param {object} fixture 本用例的房源基线。
 * @returns {object} 当前用例的内存状态，边界场景可显式替换rows。
 */
export function configurePropertyApiMock(propertyApi, fixture) {
  const state = { rows: [{ ...fixture }] };
  propertyApi.getList.mockImplementation(async (query) => {
    const filtered = state.rows.filter(
      (row) => !query.keyword || row.name.includes(query.keyword),
    );
    return {
      items: filtered.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      total: filtered.length,
      summary: {
        total: state.rows.length,
        forSale: state.rows.length,
        sold: 0,
        totalPrice: state.rows.reduce((sum, row) => sum + row.price, 0),
      },
    };
  });
  // 详情返回当前记录，确保编辑读取的是上一步操作后的资料。
  propertyApi.getById.mockImplementation(async (id) =>
    state.rows.find((row) => row.id === id),
  );
  // 新增只写模拟后端集合，页面必须靠成功后的重新查询显示新记录。
  propertyApi.create.mockImplementation(async (data) => {
    state.rows.push({ ...fixture, ...data, id: "2" });
  });
  // 以 ID 合并业务字段，保留未改变的资料，供列表刷新验证。
  propertyApi.update.mockImplementation(async (id, data) => {
    state.rows = state.rows.map((row) =>
      row.id === id ? { ...row, ...data } : row,
    );
  });
  // 删除模拟后端记录，验证页面在重新查询后移除对应行。
  propertyApi.delete.mockImplementation(async (id) => {
    state.rows = state.rows.filter((row) => row.id !== id);
  });
  return state;
}
