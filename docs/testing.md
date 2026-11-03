# 测试目录与运行说明

**业务代码和测试代码整体分开**：`src/` 是前端业务实现，`mock/` 是开发用模拟API服务，根目录 `tests/` 是全部测试用例、测试数据、Mock及执行工具。`src/` 和 `mock/` 不再存放测试文件。

[115个API用例五列表格](api-test-cases.md) 按模块列出测试编号、接口、具体数据、预期和实际返回结果；编号能跳转到当前源码。完整真实请求、响应与断言见 [JSON执行证据](reports/api-test-results.json)。

## 目录结构

```text
src/                                      前端业务代码
mock/                                     独立开发模拟后端，不是Jest Mock
jest.config.cjs                           根目录Jest配置

tests/                                    所有测试相关代码
├── property-management/                   房源管理模块
│   ├── components/
│   │   └── PropertyManagementPage.test.js  前端页面测试
│   ├── endpoints/                         五个房源API的独立用例
│   ├── flows/
│   │   └── property-api.test.cjs           原有完整CRUD流程
│   ├── fixtures/
│   │   ├── propertyApiFixtures.cjs        API请求及持久化前置数据
│   │   └── propertyComponentFixtures.js   页面及表单输入数据
│   ├── mocks/
│   │   └── propertyApiMock.js             前端专用API替身和内存CRUD
│   └── helpers/
│       └── propertyApiContext.cjs         本模块默认前置数据
├── purchase-approval/                     购房审批模块
│   ├── components/
│   │   ├── PurchaseApplicationDialog.test.js
│   │   └── PurchaseApprovalDialog.test.js
│   ├── endpoints/                         申请、详情、列表和审批API
│   ├── flows/
│   │   ├── purchase-application-api.test.cjs
│   │   └── purchase-approval-api.test.cjs
│   ├── fixtures/
│   │   ├── purchaseApiFixtures.cjs        申请及审批请求、申请快照
│   │   └── purchaseComponentFixtures.js   选择房源、申请及审批表单数据
│   ├── mocks/
│   │   └── purchaseApplicationApiMock.js  前端专用申请/审批API替身
│   └── helpers/
│       └── purchaseApprovalApiContext.cjs 本模块默认前置数据
└── shared/                                只放共用工具，无混合业务fixture
    ├── endpoints/
    │   └── health.get.test.cjs            健康检查及未知路由
    ├── helpers/
    │   ├── apiTestContext.cjs             随机端口、临时文件、HTTP和清理
    │   └── browserMocks.js               JSDOM dialog及UUID支持
    └── runners/
        ├── apiTestFiles.cjs               统一发现用例
        ├── run-api-tests.cjs              API执行入口
        ├── apiTestReportRecorder.cjs      观察真实请求及断言
        └── generate-api-test-report.cjs   生成五列表格和JSON实测报告
```

## 运行命令

在项目根目录运行；API测试自动启动隔离服务，无需手动运行开发API。

```bash
CI=true npm test -- --watchAll=false --runInBand
npm run test:api
npm run test:api:properties
npm run test:api:approvals
npm run test:api:endpoints
npm run test:api:flows
npm run test:api:report

# 前端按模块筛选
CI=true npm test -- --watchAll=false --runInBand tests/property-management/components
CI=true npm test -- --watchAll=false --runInBand tests/purchase-approval/components

# API按模块和类型筛选
node tests/shared/runners/run-api-tests.cjs --module property-management --kind flows

# 单个API测试文件
node --test tests/property-management/endpoints/properties.create.test.cjs
```

前端直接使用 `jest.config.cjs`，扫描 `tests/**/*.test.js`；已显式声明与原项目相同版本的Jest及转换器，不再通过CRA的src测试入口。API由Node原生运行器执行 `.test.cjs`，两种运行器不会误执行对方的测试。开发启动和生产构建仍使用原有CRA命令。

## 数据、Mock和通用工具分别放哪里

| 内容                  | 位置                                                      | 规则                                          |
| --------------------- | --------------------------------------------------------- | --------------------------------------------- |
| 房源API测试数据       | property-management/fixtures/propertyApiFixtures.cjs      | 房源记录、默认三套房源、新增/更新请求体       |
| 房源页面测试数据      | property-management/fixtures/propertyComponentFixtures.js | 页面记录和表单输入值，每次返回新对象          |
| 申请/审批API测试数据  | purchase-approval/fixtures/purchaseApiFixtures.cjs        | 申请、快照、提交及审批请求                    |
| 申请/审批组件测试数据 | purchase-approval/fixtures/purchaseComponentFixtures.js   | 买方、成交信息、房源选择与待审核申请          |
| 房源前端API Mock      | property-management/mocks/propertyApiMock.js              | 模拟内存CRUD，每个用例独立状态                |
| 申请/审批前端API Mock | purchase-approval/mocks/purchaseApplicationApiMock.js     | 只提供Jest替身，case显式指定成功、失败或冲突  |
| 模块API前置数据       | 各模块 helpers/\*ApiContext.cjs                           | 调用本模块fixture，组装默认数据后交给公共工具 |
| HTTP服务工具          | shared/helpers/apiTestContext.cjs                         | 只默认空集合；不导入房源或申请fixture         |
| 浏览器测试兼容        | shared/helpers/browserMocks.js                            | 仅处理JSDOM缺少的dialog/UUID能力，无业务数据  |

API测试不Mock HTTP或持久化，验证的是真实模拟后端。前端组件测试Mock API调用边界，继续执行真实组件、校验和Hook。某个case专属的异常响应仍写在case中，让测试意图一眼可见。

购房申请需要房源，房源删除测试需要历史申请，因此允许跨模块**引用其权威fixture**，不复制另一份相同数据。公共请求、服务生命周期、浏览器兼容及执行工具仍共用一份。

## 保留的用例与覆盖范围

全部用例及断言保留：前端11个（房源5、购房审批6），API115个。API其中112个为独立接口用例、3个为原有完整流程。房源API50个、购房审批API63个、公共API2个；完整流程继续覆盖CRUD、并发、重启和旧数据迁移。

| 所属模块 | API（均带 /api/v1 前缀）                  | 对应独立测试文件                        |
| -------- | ----------------------------------------- | --------------------------------------- |
| 房源管理 | GET /properties                           | endpoints/properties.list.test.cjs      |
| 房源管理 | POST /properties                          | endpoints/properties.create.test.cjs    |
| 房源管理 | GET /properties/:id                       | endpoints/properties.detail.test.cjs    |
| 房源管理 | PUT /properties/:id                       | endpoints/properties.update.test.cjs    |
| 房源管理 | DELETE /properties/:id                    | endpoints/properties.delete.test.cjs    |
| 购房审批 | GET /purchase-applications                | endpoints/applications.list.test.cjs    |
| 购房审批 | GET /purchase-applications/:id            | endpoints/applications.detail.test.cjs  |
| 购房审批 | POST /purchase-applications               | endpoints/applications.create.test.cjs  |
| 购房审批 | POST /purchase-applications/:id/approvals | endpoints/applications.approve.test.cjs |
| 公共     | GET /health                               | shared/endpoints/health.get.test.cjs    |

每个独立API用例都使用专属随机端口和临时数据文件，失败也会清理，不接触 `mock/.data/`。查询、修改、删除和审批测试直接准备本用例数据，不依赖其他case先运行新增接口。模块fixture默认值及覆盖值均有中文注释，前端Mock每个用例重新配置，不在用例间共享写入状态。

## 报告维护

`test:api` 和报告使用 `tests/shared/runners/apiTestFiles.cjs` 的统一发现规则，支持模块、endpoints/flows筛选；非法筛选或零文件明确失败。新增 `.test.cjs` 会被普通API测试自动发现；新增报告分组时需同步报告清单。

`npm run test:api:report` 观察原测试的真实请求和断言，保留原测试编号，刷新迁移后的源码链接。预期来自断言expected值，实际来自本次HTTP响应和实际断言值。只有全部通过且每个用例有完整证据才更新报告；失败返回非零码，不把旧报告当成本轮通过。超长内容在五列表格中摘要展示，完整输入及返回保存在JSON。

这些测试覆盖当前开发模拟API；正式后端的身份、权限和数据库事务需要后续单独验证，不宣称已有生产后端能力。
