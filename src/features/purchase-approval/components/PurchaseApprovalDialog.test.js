import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import PurchaseApprovalDialog from "./PurchaseApprovalDialog";
import { purchaseApplicationApi } from "../../../api/purchaseApplicationApi";
// 只模拟审批 API，仍使用真实审批表单、原因校验和成功/失败处理。
jest.mock("../../../api/purchaseApplicationApi", () => ({
  purchaseApplicationApi: { submitApproval: jest.fn() },
}));
// 固定待审核申请及提交历史，验证审批提交的版本和展示内容。
const application = {
  id: "pa-1",
  code: "PA-001",
  version: 1,
  status: "待审核",
  propertySnapshot: {
    name: "审核测试房源",
    code: "RE-001",
    city: "上海",
    district: "浦东新区",
    address: "模拟地址",
    area: 100,
    price: 600,
  },
  buyerName: "模拟买方",
  buyerPhone: "13800138000",
  dealPrice: 580,
  deposit: 20,
  paymentMethod: "全款",
  expectedSigningDate: "2027-01-15",
  history: [
    {
      id: "h1",
      action: "提交申请",
      actor: "演示申请人",
      comment: "",
      createdAt: "2026-11-01T00:00:00Z",
    },
  ],
};
/**
 * 提供当前 JSDOM 环境缺少的原生浏览器方法，保证测试运行生产弹窗逻辑。
 * 这些替身只模拟打开/关闭属性和加密 UUID 支持，不代替业务接口。
 */
beforeAll(() => {
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: { randomUUID: require("crypto").randomUUID },
  });
  /** 测试替身：标记 dialog 为打开；不尝试模拟原生浏览器的完整模态行为。 */
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  /** 测试替身：清除打开标记，让组件卸载清理可在 JSDOM 中执行。 */
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
/** 清空审批接口调用记录，由各用例设置后端响应，保证断言互不影响。 */
beforeEach(() => jest.clearAllMocks());
/**
 * 场景：一级审批选择驳回。
 * 操作：先不填原因提交，再输入原因并确认。
 * 预期：空原因不调用接口；有效请求携带申请版本、驳回决定和原因。
 */
test("reject requires a reason and submits the current application version", async () => {
  const onApprovalSubmitted = jest.fn();
  purchaseApplicationApi.submitApproval.mockResolvedValue({
    ...application,
    status: "已驳回",
  });
  render(
    <PurchaseApprovalDialog
      application={application}
      onClose={jest.fn()}
      onApprovalSubmitted={onApprovalSubmitted}
    />,
  );
  expect(screen.getByText("提交申请")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "驳回" }));
  fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));
  expect(await screen.findByText("请填写驳回原因")).toBeInTheDocument();
  // 空驳回原因应在前端被拦截，不应把无效审批发送到后端。
  expect(purchaseApplicationApi.submitApproval).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("驳回原因（必填）"), {
    target: { value: "缺少买方资料" },
  });
  fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));
  await waitFor(() =>
    expect(onApprovalSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ status: "已驳回" }),
    ),
  );
  expect(purchaseApplicationApi.submitApproval).toHaveBeenCalledWith(
    "pa-1",
    expect.objectContaining({
      decision: "reject",
      version: 1,
      comment: "缺少买方资料",
    }),
  );
});
/**
 * 场景：通过审批时首次网络失败，用户未修改意见后重试。
 * 预期：失败不丢失意见；成功触发回调；两次 requestKey 相同，支持幂等重试。
 */
test("approve handles failure and unchanged retry reuses request identity", async () => {
  const onApprovalSubmitted = jest.fn();
  purchaseApplicationApi.submitApproval
    .mockRejectedValueOnce(new Error("审核服务暂时不可用"))
    .mockResolvedValueOnce({ ...application, status: "已通过" });
  render(
    <PurchaseApprovalDialog
      application={application}
      onClose={jest.fn()}
      onApprovalSubmitted={onApprovalSubmitted}
    />,
  );
  fireEvent.change(screen.getByLabelText("审核意见（选填）"), {
    target: { value: "已核验" },
  });
  fireEvent.click(screen.getByRole("button", { name: "确认通过" }));
  await screen.findByText("审核服务暂时不可用");
  expect(screen.getByLabelText("审核意见（选填）")).toHaveValue("已核验");
  fireEvent.click(screen.getByRole("button", { name: "确认通过" }));
  await waitFor(() => expect(onApprovalSubmitted).toHaveBeenCalled());
  // 两次审批内容未变时复用 requestKey，避免网络失败重试产生重复审批。
  expect(
    purchaseApplicationApi.submitApproval.mock.calls[0][1].requestKey,
  ).toBe(purchaseApplicationApi.submitApproval.mock.calls[1][1].requestKey);
});
/**
 * 场景：其他操作已处理该申请，后端拒绝本次审批。
 * 预期：展示冲突原因，恢复确认按钮，不触发成功回调或提前关闭弹窗。
 */
test("conflicting review does not close the form or claim success", async () => {
  const onApprovalSubmitted = jest.fn();
  purchaseApplicationApi.submitApproval.mockRejectedValueOnce(
    new Error("申请已被处理或版本已变化，请刷新后查看最新结果"),
  );
  render(
    <PurchaseApprovalDialog
      application={application}
      onClose={jest.fn()}
      onApprovalSubmitted={onApprovalSubmitted}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "确认通过" }));
  await screen.findByText("申请已被处理或版本已变化，请刷新后查看最新结果");
  expect(onApprovalSubmitted).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "确认通过" })).toBeEnabled();
});
