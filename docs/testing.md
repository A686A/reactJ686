# API 测试说明

现有测试分成两类，运行的都是真实 HTTP 服务，不将接口函数 Mock 成固定成功值：

- **逐接口独立测试**：`mock/tests/endpoints/`，9 个业务 API 加健康检查，共 10 个分组、112 个独立用例。
- **完整流程集成测试**：`mock/*-api.test.cjs`，原有 3 个测试完整保留，覆盖连续 CRUD、并发申请、审批冲突、服务重启与旧数据迁移。

`npm run test:api` 总计运行 115 个 API 用例。前端原有 11 个组件测试保持不变。

## 运行命令

```bash
npm run test:api              # 独立接口测试 + 原有完整流程测试
npm run test:api:endpoints    # 只运行112个逐接口用例
npm run test:api:flows        # 只运行3个完整流程用例

# 只运行一个接口组
node --test mock/tests/endpoints/properties.create.test.cjs
```

## 文件与接口对应

下表各路径都带 `/api/v1` 前缀。状态码、输入和具体字段断言以测试文件中的中文注释为准。

| 方法 / 路径                               | 独立测试文件                  | 主要场景                                                                                |
| ----------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| GET /health                               | health.get.test.cjs           | 200健康响应、JSON类型、请求追踪、未知路由404                                            |
| GET /properties                           | properties.list.test.cjs      | 分页、组合筛选、空结果、金额/面积排序、非法参数400、全库统计                            |
| POST /properties                          | properties.create.test.cjs    | 201创建和持久化、系统字段不可伪造、字段校验422、非法JSON400、内容类型415、请求体超限413 |
| GET /properties/:id                       | properties.detail.test.cjs    | 200完整字段及版本、不存在404                                                            |
| PUT /properties/:id                       | properties.update.test.cjs    | 200更新及版本递增、系统字段保持、保留申请、404/409/422/400且原数据不变                  |
| DELETE /properties/:id                    | properties.delete.test.cjs    | 空204、保留其他房源和申请、不存在404、过期版本409、内容类型415                          |
| GET /purchase-applications                | applications.list.test.cjs    | 空库、分页、关键词、状态、全库统计、内部字段隐藏、非法参数400                           |
| GET /purchase-applications/:id            | applications.detail.test.cjs  | 200详情与流程历史、404、房源更新或删除后快照仍可查                                      |
| POST /purchase-applications               | applications.create.test.cjs  | 201待审核申请、系统字段保护、金额/日期/必填校验、非在售或版本冲突409、幂等重试          |
| POST /purchase-applications/:id/approvals | applications.approve.test.cjs | 通过/驳回、原因必填、版本和终态冲突、房源资格、幂等重试、旧reviews别名、协议错误        |

## 每个独立用例如何隔离

`helpers/apiTestContext.cjs` 为**每次 it** 创建新的临时目录、数据文件和随机端口，启动真实模拟后端，并在测试生命周期结束时终止该子进程、删除临时目录。断言失败也会清理，不接触 `mock/.data/` 的开发数据。

`helpers/fixtures.cjs` 每次构造新对象。查询、更新、删除和审批用例直接准备所需数据，**不依赖其他测试先调用新增接口**。单个“原请求重试”用例内连续发出两次请求是该场景的操作步骤，不是用例间依赖。

默认三条房源为：property-1在售、500万元、100㎡；property-2待上架、200万元、50㎡；property-3已售、800万元、180㎡。申请默认成交价480万元、定金20万元、关联property-1/version1。测试使用固定日期，不依赖当天时间；全部数据都是模拟值。

## 注释与断言规范

每个用例注明测试接口、前置记录、具体输入及预期响应。参数化用例的每一项也在相邻注释中给出字段覆盖值、预期状态码和字段错误；其他值明确引用合法fixture基线，基线所有字段值集中写在构造方法注释中。

成功用例检查响应状态及关键内容，写接口还核对实际文件。失败用例除检查400/404/409/413/415/422，还检查文件与请求前深度相等，避免“返回错误但数据已被修改”。自动生成的ID、时间和追踪号检查其有效性或关联关系，而不硬编码随机值。

这是对当前开发模拟 API 的契约测试。未来接入正式后端时，需要将同类契约迁移到真实后端，并增加身份认证、数据权限及数据库事务测试；当前模拟服务没有这些能力，测试不会伪造其已实现。
