import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import PurchaseApprovalDialog from "./PurchaseApprovalDialog";
import { purchaseApplicationApi } from "../../../api/purchaseApplicationApi";
jest.mock("../../../api/purchaseApplicationApi", () => ({
  purchaseApplicationApi: { submitApproval: jest.fn() },
}));
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
beforeAll(() => {
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: { randomUUID: require("crypto").randomUUID },
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
beforeEach(() => jest.clearAllMocks());
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
  expect(
    purchaseApplicationApi.submitApproval.mock.calls[0][1].requestKey,
  ).toBe(purchaseApplicationApi.submitApproval.mock.calls[1][1].requestKey);
});
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
