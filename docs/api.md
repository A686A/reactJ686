# 房源 REST API v1

基础路径 `/api/v1`。所有写请求使用 `Content-Type: application/json`。总价统一为**万元**，建筑面积为 **㎡**；时间为 UTC ISO 8601，页面按浏览器时区显示。开发服务无需认证，生产身份验证由实际后端提供，不在浏览器存放服务密钥。

| 方法   | 路径            | 成功响应                         |
| ------ | --------------- | -------------------------------- |
| GET    | /health         | 200 `{ "status": "ok" }`         |
| GET    | /properties     | 200 分页结果                     |
| GET    | /properties/:id | 200 完整房源                     |
| POST   | /properties     | 201 完整房源                     |
| PUT    | /properties/:id | 200 完整房源（全量更新业务字段） |
| DELETE | /properties/:id | 204，无响应体                    |

## 查询

`keyword` 搜索名称/编号/城市/区域/地址（不区分大小写）；`type`、`status` 精确筛选。`page` 默认 1；`pageSize` 默认 8，最大 100。`sort` 支持 updatedAt（默认）、price、area、name；`order` 支持 desc（默认）、asc。

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 8,
  "summary": { "total": 9, "forSale": 5, "sold": 1, "totalPrice": 6959 }
}
```

`total` 是当前筛选结果数量，`summary` 是全库统计，不随筛选变化。房源总价值是全部登记房源价格之和，并非估值或实时行情。

## 新增 / 修改字段

```json
{
  "name": "滨江壹号 · 江景三居",
  "city": "上海",
  "district": "浦东新区",
  "address": "滨江大道188号2栋1801",
  "type": "住宅",
  "status": "在售",
  "area": 128.5,
  "price": 980,
  "rooms": 3,
  "contact": "林经理",
  "phone": "13800138000",
  "description": "南向，带车位"
}
```

除 description 外均必填。name ≤80 字，city/district ≤30 字，address ≤200 字，contact ≤40 字。phone 为 6–25 个数字、空格、括号或短横线，可带首位 +。area 为 0.01–1,000,000，price 为 0.01–10,000,000，rooms 为 0–100 整数；description ≤1,000 字。类型：住宅、公寓、商铺、写字楼；状态：待上架、在售、已售、已下架。服务端始终独立校验，不信任客户端校验。

响应额外包含 `id`（字符串）、`code`（系统生成编号）、`version`（整数，初始 1）、`createdAt`、`updatedAt`。客户端不能指定这些系统字段。

PUT 在业务字段之外必须附带读取时的 `version`。DELETE 请求体为 `{ "version": 1 }`。写入成功 version 加一；旧版本返回 409，用户须重新读取后再操作，不自动覆盖。

## 错误

```json
{
  "message": "请检查房源信息",
  "fields": { "name": "必填，最多 80 字" },
  "requestId": "服务端请求追踪 ID"
}
```

400 参数/JSON 错误，404 资源不存在，405 方法不支持，409 版本冲突，413 请求体过大，415 内容类型不支持，422 字段校验失败，500 服务错误。所有响应带 X-Request-Id，不泄露服务端堆栈。

## 购房申请（独立业务模块）

| 方法 | 路径                       | 成功响应                                  |
| ---- | -------------------------- | ----------------------------------------- |
| GET  | /purchase-applications     | 200 `{ items, total, page, pageSize }`    |
| GET  | /purchase-applications/:id | 200 完整申请与提交时房源快照              |
| POST | /purchase-applications     | 201 新建申请；同一请求重试返回 200 原申请 |

列表支持 `keyword`（申请编号、买方姓名、房源编号/名称）、`page`（默认 1）、`pageSize`（默认 8，最大 100），按提交时间倒序返回。

```json
{
  "submissionKey": "客户端生成的 UUID，同一次提交重试保持不变",
  "propertyId": "1",
  "propertyVersion": 1,
  "buyerName": "模拟买方",
  "buyerPhone": "13800138000",
  "dealPrice": 980,
  "deposit": 20,
  "paymentMethod": "商业贷款",
  "expectedSigningDate": "2027-01-15",
  "remarks": "申请备注"
}
```

除 remarks 外均必填；deposit 可以为 0，表示尚无意向定金。买方姓名 1–40 字；电话沿用房源联系电话格式；dealPrice 为 0.01–10,000,000 万元；deposit 为 0 到成交总价之间；日期须为有效 YYYY-MM-DD；备注最多 1,000 字。付款方式：全款、商业贷款、公积金贷款、组合贷款。登记定金不代表收款或发起支付，不在此环节采集身份证件、银行账户等资料。

服务端重新校验房源存在、仍在售且版本与 propertyVersion 一致，否则 409；客户端应保留买方信息，让用户重新选择房源并核对。成交价格由申请人填写，不直接覆盖房源挂牌价。相同 submissionKey、相同内容重试返回同一申请；相同 key 配不同内容返回 409。此幂等保证适用于当前单进程模拟服务，生产应通过数据库唯一约束与事务实现，并绑定申请人身份。

响应包含提交字段（不返回 submissionKey）及系统生成的 id、code、status（已提交）、submittedAt、propertySnapshot（id/code/name/city/district/address/area/price/type）。房源快照不可随房源后续编辑变化，房源被删除也保留申请历史。申请与房源共同写入开发数据文件，重启后保留。

**本次流程仅覆盖申请发起与提交**：没有审批、签约、支付、过户或撤回操作，提交的申请只读。多位买方可以对同一套在售房源提交申请，提交不锁房、不改变房源状态；独占认购、重复申请规则、审批权限及后续状态流转需业务确认后实现。GET 列表/详情在生产中必须受身份与数据权限约束。
