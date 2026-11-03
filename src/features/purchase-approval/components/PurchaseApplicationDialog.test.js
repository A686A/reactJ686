import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import PurchaseApplicationDialog from "./PurchaseApplicationDialog";
import { propertyApi } from "../../../api/propertyApi";
import { purchaseApplicationApi } from "../../../api/purchaseApplicationApi";
// 仅模拟 API 边界，让房源选择、表单校验、核对和提交仍走真实组件。
jest.mock("../../../api/propertyApi", () => ({
  propertyApi: { getList: jest.fn() },
}));
jest.mock("../../../api/purchaseApplicationApi", () => ({
  purchaseApplicationApi: { submitApplication: jest.fn() },
}));
// 在售房源携带版本 3；提交断言据此确认没有丢失并发校验所需信息。
const property = {
  id: "1",
  version: 3,
  code: "RE-001",
  name: "申请测试房源",
  city: "上海",
  district: "浦东新区",
  address: "模拟地址",
  area: 100,
  price: 600,
  status: "在售",
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
/**
 * 清空上个用例的调用记录，为房源选择器提供一条在售房源。
 * 具体提交的成功、失败或冲突行为由各用例单独设置。
 */
beforeEach(() => {
  jest.clearAllMocks();
  propertyApi.getList.mockResolvedValue({ items: [property], total: 1 });
});
/**
 * 等待异步房源选项出现并选中，再填写完整的买方及成交信息。
 * 通过真实表单事件驱动校验，不直接修改组件内部状态。
 */
async function fill() {
  fireEvent.click(await screen.findByRole("radio"));
  for (const [label, value] of Object.entries({
    买方姓名: "模拟买方",
    联系电话: "13800138000",
    "成交总价（万元）": "580",
    "意向定金（万元）": "20",
    预计签约日期: "2027-01-15",
  })) {
    fireEvent.change(screen.getByLabelText(label, { exact: false }), {
      target: { value },
    });
  }
}
/**
 * 场景：申请必须选择房源、填写成交信息，并经核对后才提交。
 * 准备：使用可手动完成的 Promise，让提交状态保持足够时间以验证连续点击。
 * 预期：未选择时阻止下一步；核对阶段不发请求；最终只调用一次接口，携带房源版本和数值金额。
 */
test("requires house and transaction data, reviews before submitting then prevents duplicate clicks", async () => {
  const onSubmitted = jest.fn();
  // 控制请求完成时机，保证可以在未完成期间再点击一次，检验同步防重锁。
  let resolve;
  purchaseApplicationApi.submitApplication.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(
    <PurchaseApplicationDialog onClose={jest.fn()} onSubmitted={onSubmitted} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "下一步，核对申请" }));
  expect(await screen.findByText("请选择一套在售房源")).toBeInTheDocument();
  expect(purchaseApplicationApi.submitApplication).not.toHaveBeenCalled();
  // 填写并进入核对页，此阶段只能展示摘要，不能提前提交申请。
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "下一步，核对申请" }));
  await screen.findByRole("heading", { name: "确认购房申请" });
  expect(purchaseApplicationApi.submitApplication).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
  fireEvent.click(screen.getByRole("button", { name: "提交中…" }));
  expect(purchaseApplicationApi.submitApplication).toHaveBeenCalledTimes(1);
  expect(purchaseApplicationApi.submitApplication).toHaveBeenCalledWith(
    expect.objectContaining({
      propertyId: "1",
      propertyVersion: 3,
      dealPrice: 580,
      deposit: 20,
    }),
  );
  // 显式完成先前挂起的接口并等待 React 更新，随后核对成功回调参数。
  await act(async () => {
    resolve({ id: "pa-1", code: "PA-001" });
  });
  await waitFor(() =>
    expect(onSubmitted).toHaveBeenCalledWith({ id: "pa-1", code: "PA-001" }),
  );
});
/**
 * 场景：相同购房申请首次遇到网络错误，用户不改内容直接重试。
 * 预期：保留核对摘要和输入；两次请求 submissionKey 相同，支持后端去重。
 */
test("network failure preserves review and uses the same key for unchanged retry", async () => {
  purchaseApplicationApi.submitApplication
    .mockRejectedValueOnce(new Error("网络暂时不可用"))
    .mockResolvedValueOnce({ id: "pa-1" });
  render(
    <PurchaseApplicationDialog onClose={jest.fn()} onSubmitted={jest.fn()} />,
  );
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "下一步，核对申请" }));
  fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
  await screen.findByText("网络暂时不可用");
  expect(screen.getByText("模拟买方")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
  await waitFor(() =>
    expect(purchaseApplicationApi.submitApplication).toHaveBeenCalledTimes(2),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "确认提交" })).toBeEnabled(),
  );
  // 请求内容未变，重试必须复用同一提交标识；否则后端无法去重。
  expect(
    purchaseApplicationApi.submitApplication.mock.calls[0][0].submissionKey,
  ).toEqual(
    purchaseApplicationApi.submitApplication.mock.calls[1][0].submissionKey,
  );
});
/**
 * 场景：申请提交时房源资料变化，服务端返回 409。
 * 预期：返回填写步骤，取消旧房源选择但保留买方信息，要求重新核对最新房源。
 */
test("changed property returns to editing, clears selection and preserves buyer information", async () => {
  purchaseApplicationApi.submitApplication.mockRejectedValueOnce(
    Object.assign(new Error("房源资料已变化"), {
      status: 409,
      fields: { propertyId: "请重新选择最新的在售房源" },
    }),
  );
  render(
    <PurchaseApplicationDialog onClose={jest.fn()} onSubmitted={jest.fn()} />,
  );
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "下一步，核对申请" }));
  fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
  await screen.findByText("房源资料已变化");
  expect(screen.getByLabelText(/买方姓名/)).toHaveValue("模拟买方");
  expect(screen.queryByText("已选：申请测试房源")).not.toBeInTheDocument();
  expect(await screen.findByRole("radio")).not.toBeChecked();
});
