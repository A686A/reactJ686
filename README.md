# 栖境 · 不动产管理平台

**一个前端项目、一个侧栏菜单、两个业务模块**：

1. **房源管理**：房源增删改查、详情、搜索筛选、分页排序和统计。
2. **审核流程**：发起购房申请、选择房源、填写成交信息、确认提交，以及一级审核（通过 / 驳回）和流程记录。

两者共用应用入口、布局、路由、HTTP 请求封装、房源 API、弹窗、格式化工具及样式。业务组件、状态和规则分别放在各模块目录，不复制公共代码。不是两个独立项目，也不是两个仓库。

## 运行与验证

React 18 + JavaScript + React Router + Axios，保留现有 CRA 工具链。已验证 Node.js 24.19.0 / npm 11.9.0。

```bash
npm ci --registry=https://registry.npmjs.org --replace-registry-host=registry.npmmirror.com
npm run mock        # 终端 1：独立模拟 API，127.0.0.1:3004
npm start           # 终端 2：整个前端项目，端口 3000
```

开发时 `/api/v1` 通过 CRA proxy 转发到 API。`.env.example` 为配置示例，可复制为 `.env.development.local`；`REACT_APP_*` 会公开进入浏览器打包产物，不要存放密钥。

```bash
npm run build
CI=true npm test -- --watchAll=false --runInBand
npm run test:api
```

## 目录结构

```text
src/
  app/App.js                   唯一入口布局、菜单和路由
  api/properties.js            两模块共用的房源接口，维护一份
  config/env.js                公共环境配置
  pages/
    properties/                房源管理页面
    workflows/                 审核流程工作台页面
  features/
    properties/                房源模块：components / hooks / model
    workflows/                 审核模块：api / components / hooks / model
  shared/
    api/http.js                唯一 Axios 实例、超时与错误归一化
    components/Modal.js        共用弹窗、焦点管理
    utils/format.js            共用数字格式化
  index.css                    共用主题、布局与组件样式
mock/
  server.cjs                   开发 API 与房源 CRUD
  purchases.cjs                申请提交、审核、记录和状态校验
  seed.json                    初始房源演示数据
  .data/                       忽略提交的本地运行数据
```

菜单路径：`/properties` 为房源管理，`/workflows/purchases` 为审核流程；原 `/purchase-applications` 路径重定向到审核流程，保留旧链接兼容。

## 一级审核规则

申请时选择在售房源，填写买方姓名/电话、成交总价、意向定金、付款方式、预计签约日期和备注；核对后确认提交。价格单位统一为**万元**，定金可为 0，仅登记意向，不发起支付。

状态流转：**提交申请 → 待审核 → 已通过 / 已驳回**。待审核申请可处理一次，驳回必须填写原因，通过可填写意见。结果、处理时间和演示处理人写入流程记录；结果终结后不可直接覆盖或删除。旧“已提交”申请自动进入待审核队列，历史资料保留。

通过审核不会锁房或标记房源已售。通过时后端再次核验房源仍在售且版本与提交时一致；若资料已变化，应核实并驳回后重新申请。拒绝审核不依赖房源当前是否存在。申请与审核均支持原请求重试去重；并发审核通过申请版本控制避免重复处理。详情使用申请时的房源快照，房源后续编辑、删除不影响历史资料。

当前为一级审核，未启用多级审批、撤回重提、签约、支付或过户；可对同一套在售房源发起多份申请，独占认购规则尚未实现。

## 后端与部署边界

模拟服务首次从 seed.json 初始化，后续保存在 mock/.data/properties.json，重启保留。房源及申请审核记录共同持久化，旧数据文件自动兼容。不要在日常启动时重置数据；集成测试使用临时隔离文件。`MOCK_PORT`、`MOCK_HOST`、`MOCK_DATA_FILE` 支持覆盖默认配置。

UI 不直接读写文件，也不使用 localStorage 冒充服务端。上线部署只发布 build/，通过同源网关代理 `/api/v1` 或构建时的 `REACT_APP_API_BASE_URL` 对接真实后端。生产服务器对前端路由设置 SPA history fallback；API 优先转发，不能把 API 404 返回成 HTML。

**模拟 API 未启用鉴权，不可公开部署。** 演示申请人/审核员由模拟后端固定，不代表真实登录用户；正式后端必须提供身份认证、申请与审核权限分离、数据权限、不可篡改审计及数据库事务和唯一约束。文件持久化仅支持单进程开发服务。CRA 与部分测试依赖有既有维护告警，后续工具链升级可独立进行。

详细请求、响应及错误约定见 [接口契约](docs/api.md)。
