const { createApiContext } = require("../../shared/helpers/apiTestContext.cjs");
const {
  buildPropertyCollection,
} = require("../fixtures/propertyApiFixtures.cjs");

/**
 * 准备本模块的默认前置数据：三套房源、零申请；调用方可逐项覆盖。
 * 数据归业务模块所有，随机端口、请求发送和清理由公共工具负责。
 * @param {import('node:test').TestContext} test 当前独立用例。
 * @param {object} initial 当前场景覆盖的房源或申请数据。
 */
function createPropertyApiContext(test, initial = {}) {
  return createApiContext(test, {
    properties: buildPropertyCollection(),
    purchaseApplications: [],
    ...initial,
  });
}
module.exports = { createPropertyApiContext };
