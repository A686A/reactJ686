# 按业务模块组织的测试说明

测试按模块分文件夹，不把房源和购房审批的 case 混在一个目录里。**独立API测试、原有完整流程测试和前端组件测试全部保留**；本次仅整理位置、导入和执行入口，未改变测试数据、断言及业务实现。

[115个API用例五列表格](api-test-cases.md) 也按模块排列，测试编号能跳转到迁移后的源码。完整实际请求、响应与断言值见 [JSON执行证据](reports/api-test-results.json)。

## 目录结构

```text
mock/tests/                           API测试，模块优先
├── property-management/             房源管理模块
│   ├── endpoints/                   五个房源API的独立用例
│   │   ├── properties.list.test.cjs
│   │   ├── properties.create.test.cjs
│   │   ├── properties.detail.test.cjs
│   │   ├── properties.update.test.cjs
│   │   └── properties.delete.test.cjs
│   └── flows/                       本模块完整CRUD流程
│       └── property-api.test.cjs
├── purchase-approval/               购房审批模块
│   ├── endpoints/                   申请、详情、查询和审批独立用例
│   │   ├── applications.list.test.cjs
│   │   ├── applications.detail.test.cjs
│   │   ├── applications.create.test.cjs
│   │   └── applications.approve.test.cjs
│   └── flows/                       本模块完整流程
│       ├── purchase-application-api.test.cjs
│       └── purchase-approval-api.test.cjs
└── shared/                          公共部分，所有模块共用一份
    ├── endpoints/
    │   └── health.get.test.cjs       健康检查及未知路由
    └── helpers/
        ├── apiTestContext.cjs       隔离服务启动、真实HTTP、清理
        └── fixtures.cjs             共用数据构造方法

src/tests/                           前端组件测试，同样按模块集中
├── property-management/
│   └── PropertyManagementPage.test.js
└── purchase-approval/
    ├── PurchaseApplicationDialog.test.js
    └── PurchaseApprovalDialog.test.js
```

API测试使用 Node.js 原生测试运行器，放在 `mock/tests/`；前端组件测试使用 Jest + React Testing Library，集中在 `src/tests/`，符合当前 CRA 只发现 src 内前端测试的约定。业务实现仍在 `src/features/`、`src/pages/`；mock目录根部只保留开发API实现、种子数据和忽略提交的运行数据。

模块测试数量：房源管理API 50个（49个独立用例+1个完整流程），购房审批API 63个（61个独立用例+2个完整流程），公共API 2个。前端房源组件测试5个、购房审批组件测试6个，均保留。

## 运行命令

所有命令都在项目根目录运行，不需要手动启动开发API。

```bash
npm run test:api              # 所有模块：112个独立API用例 + 3个完整流程
npm run test:api:properties   # 只运行房源管理模块，包括独立用例和完整流程
npm run test:api:approvals    # 只运行购房审批模块，包括独立用例和完整流程
npm run test:api:endpoints    # 各模块独立API用例，共112个
npm run test:api:flows        # 各模块原有完整流程，共3个
npm run test:api:report       # 重跑全部API，刷新五列表格和JSON实测证据

# 组合筛选：只跑房源模块的完整流程
node scripts/run-api-tests.cjs --module property-management --kind flows

# 定位一个API文件
node --test mock/tests/property-management/endpoints/properties.create.test.cjs

# 所有前端组件测试，共11个
CI=true npm test -- --watchAll=false --runInBand

# 按模块筛选前端组件测试
CI=true npm test -- --watchAll=false --runInBand src/tests/property-management
CI=true npm test -- --watchAll=false --runInBand src/tests/purchase-approval
```

`scripts/apiTestFiles.cjs` 是API用例发现的唯一入口。普通执行器与报告生成器使用同一规则，支持模块和测试类型筛选；非法筛选或零测试文件会明确失败，不会误报“通过”。模块目录下新增 `.test.cjs` 文件会自动被普通API测试命令发现；新增接口报告分组时，还需更新报告生成器的分组清单。

## 覆盖范围

| 所属模块 | 测试的API                                 | 对应独立测试文件                                          | 核心场景                                     |
| -------- | ----------------------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| 房源管理 | GET /properties                           | property-management/endpoints/properties.list.test.cjs    | 分页、组合筛选、排序、空结果及非法参数       |
| 房源管理 | POST /properties                          | property-management/endpoints/properties.create.test.cjs  | 创建、字段校验、非法JSON、内容类型及体积限制 |
| 房源管理 | GET /properties/:id                       | property-management/endpoints/properties.detail.test.cjs  | 完整详情及不存在记录                         |
| 房源管理 | PUT /properties/:id                       | property-management/endpoints/properties.update.test.cjs  | 更新、版本递增、系统字段保护及冲突           |
| 房源管理 | DELETE /properties/:id                    | property-management/endpoints/properties.delete.test.cjs  | 删除、空204及版本冲突，保留历史申请          |
| 购房审批 | GET /purchase-applications                | purchase-approval/endpoints/applications.list.test.cjs    | 搜索、分页、状态筛选、统计和字段保护         |
| 购房审批 | GET /purchase-applications/:id            | purchase-approval/endpoints/applications.detail.test.cjs  | 详情、历史快照、房源变更或删除后的历史保留   |
| 购房审批 | POST /purchase-applications               | purchase-approval/endpoints/applications.create.test.cjs  | 提交、必填字段、房源资格、版本和幂等         |
| 购房审批 | POST /purchase-applications/:id/approvals | purchase-approval/endpoints/applications.approve.test.cjs | 通过/驳回、原因、状态机、冲突和重试          |
| 公共     | GET /health                               | shared/endpoints/health.get.test.cjs                      | 健康状态、JSON响应、追踪ID及未知路由404      |

所有路径带 `/api/v1` 前缀。用例注释逐项写明输入、预期状态码和响应字段；完整明细保留指定的五列：测试标号、测试的API、测试数据、测试预期返回结果、测试实际返回结果。

## 隔离、断言和报告

每个独立API用例创建专属临时目录、数据文件和随机端口，启动真实模拟后端，测试失败也清理；不访问或清空 `mock/.data/` 的开发数据。共用fixture每次返回新对象，不在模块间共享可变测试状态。查询、修改、删除和审批测试直接准备各自前置记录，不依赖其他用例先运行新增接口。

成功用例断言状态码、响应内容和持久化结果；失败用例还检查数据文件与请求前深度相等。原有3个完整流程用例继续覆盖多步CRUD、并发、重启、迁移等跨步骤行为；其中保留各自启动与清理逻辑，不因目录整理重写其断言。

报告记录器观察真实HTTP及实际断言，不Mock接口结果。预期列来自断言的expected值，实际列来自本次执行返回；过长内容摘要展示，原值保存在JSON。只有全部用例通过且证据完整才覆盖报告；失败时返回非零退出码，旧报告不会冒充本轮通过结果。重排目录后保留原测试编号，更新源码链接及真实执行证据。

这些测试针对当前开发模拟API。正式后端接入后还需验证身份、权限和数据库事务，当前测试不宣称覆盖尚未实现的生产后端能力。
