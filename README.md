# 栖境 · 不动产管理前端

React 18 + JavaScript 的房源管理工作台。实现房源新增、列表/详情查询、编辑、删除，服务端分页、组合筛选和排序。保留项目现有 CRA 工具链，通过 React Router 分隔房源管理与购房申请页面，模块内 hooks 管理服务端状态，Axios 统一处理 HTTP 请求。

## 本地运行

已验证 Node.js 24.19.0 / npm 11.9.0。在仓库根目录运行：

```bash
npm ci --registry=https://registry.npmjs.org --replace-registry-host=registry.npmmirror.com
npm run mock        # 终端 1：独立开发 API，127.0.0.1:3004
npm start           # 终端 2：前端，端口 3000
```

开发时 `/api/v1` 由 CRA proxy 转发至 API 服务。修改 package.json 的 proxy 后须重启前端。`.env.example` 是配置示例；需要时复制为 `.env.development.local`，不要放入任何密钥。`REACT_APP_*` 均会被打包公开。

```bash
npm run build
CI=true npm test -- --watchAll=false --runInBand
npm run test:api
```

## 目录与职责

```text
src/
  app/                         应用入口、React Router 路由与整体布局
  config/                      环境配置
  pages/properties/            房源工作台页面，组织业务组件
  pages/purchases/             购房申请档案页面
  features/properties/
    api/                       房源接口访问，不操作 UI
    components/                房源表单、详情等业务组件
    hooks/                     查询状态、取消请求、刷新与分页修正
    model/                     字段定义、表单校验、数据转换
  features/purchases/          独立申请业务：api/components/hooks/model
  shared/
    api/                       Axios 实例、超时与错误归一化
    components/                通用弹窗（原生 dialog / 焦点管理）
mock/                          独立模拟后端，仅供开发
  server.cjs                   REST API、服务端校验与文件持久化
  seed.json                    演示种子数据
  .data/                       忽略提交的本地运行数据
  server.test.cjs              真实 HTTP 接口集成测试
```

UI 不直接读取模拟文件，不用 localStorage 冒充后端；更换真实后端时保持接口契约，只调整部署代理或 API 地址。操作成功后重新查询服务端数据；新增会清除筛选并回到最近更新第一页，编辑后若不再符合筛选则从当前列表消失，删除最后一条时自动修正页码。保存失败保留表单输入；请求取消避免旧查询覆盖新查询；版本冲突阻止覆盖别人的修改。

## 数据与部署边界

模拟数据首次启动从 seed.json 初始化，后续保存在 mock/.data/properties.json，重启保留。重置时先停模拟服务，再删除该文件并重启。`MOCK_PORT`、`MOCK_HOST`、`MOCK_DATA_FILE` 可覆盖默认配置。并发写入仅针对单进程开发服务；不要运行多个进程共享此文件。

生产部署只发布 `build/`；部署真实后端和数据库，通过网关将 `/api/v1` 转发到后端。跨域部署由后端明确配置 CORS，前端 API 地址在构建时注入。**模拟服务没有登录鉴权，禁止公开部署。** 当前实现是可联调的前端业务模块，不代表已经具备商业生产上线条件。真实项目上线还需后端身份认证、角色/数据权限、审计日志、数据库迁移/备份、敏感数据策略、监控告警和部署流水线。CRA 已停止维护，迁移构建工具应作为独立变更处理。

详细字段、请求、响应和错误规范见 [接口契约](docs/api.md)。

## 购房申请办理

访问 `/purchase-applications` 或侧栏「购房申请」。发起申请 → 搜索并选择在售房源 → 填写买方姓名、电话、成交总价、意向定金、付款方式和预计签约日期 → 核对信息 → 确认提交。提交成功生成申请编号，在列表和详情中可查看；刷新、重启仍保留。成交总价/定金单位均为万元。

房源选择支持后端搜索和分页，不会只加载前 100 条；客户端不自动把挂牌价当成交价。提交阶段的房源版本校验、服务端字段校验、请求幂等、房源历史快照均由独立模拟 API 执行。申请不自动售出或锁定房源，目前只支持“已提交”的只读申请。后续审批、签约、过户作为后续流程设计，详见接口文档。

生产服务器须配置 SPA history fallback，将 `/properties`、`/purchase-applications` 等前端页面请求回退到 `build/index.html`，并优先转发 `/api/v1` 到真实后端。不要把 API 的 404 响应回退为 HTML。开发服务器已支持路由刷新。
