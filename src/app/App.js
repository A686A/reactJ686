import PropertyManagementPage from "../pages/property-management/PropertyManagementPage";
import PurchaseApprovalPage from "../pages/purchase-approval/PurchaseApprovalPage";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="/" aria-label="栖境首页">
            <span className="brand-symbol">栖</span>
            <div>
              栖境<span>QIJING ESTATE</span>
            </div>
          </a>
          <div className="workspace-label">
            工作空间 <span>WORKSPACE</span>
          </div>
          <nav aria-label="主导航">
            <NavLink
              to="/property-management"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span>▦</span>房源管理<span className="nav-arrow">›</span>
            </NavLink>
            <NavLink
              to="/purchase-approvals"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span>▤</span>审核流程<span className="nav-arrow">›</span>
            </NavLink>
          </nav>
          <div className="sidebar-bottom">
            <div className="side-card">
              <span>让资产管理更从容</span>
              <p>每一处空间，都值得被认真管理。</p>
              <div className="building-art">▥ ▥ ▥</div>
            </div>
            <div className="workspace-profile">
              <span className="avatar">栖</span>
              <div>
                演示工作空间<small>本地开发 · 未启用登录</small>
              </div>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <span>
              不动产管理平台 <span className="topbar-divider">/</span>{" "}
              <strong>资产工作台</strong>
            </span>
            <span className="environment">
              <i /> DEMO 环境
            </span>
          </header>
          <main>
            <Routes>
              <Route
                path="/"
                element={<Navigate to="/property-management" replace />}
              />
              <Route
                path="/property-management"
                element={<PropertyManagementPage />}
              />
              <Route
                path="/purchase-approvals"
                element={<PurchaseApprovalPage />}
              />
              <Route
                path="/purchase-applications"
                element={<Navigate to="/purchase-approvals" replace />}
              />
              <Route
                path="/properties"
                element={<Navigate to="/property-management" replace />}
              />
              <Route
                path="/workflows/purchases"
                element={<Navigate to="/purchase-approvals" replace />}
              />
              <Route
                path="*"
                element={
                  <div className="empty">
                    <h1>页面不存在</h1>
                    <NavLink to="/property-management" className="button">
                      返回房源管理
                    </NavLink>
                  </div>
                }
              />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
