import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import PurchaseForm from "./PurchaseForm";
import { propertyApi } from "../../properties/api/properties";
import { purchaseApi } from "../api/purchases";
jest.mock("../../properties/api/properties", () => ({
  propertyApi: { list: jest.fn() },
}));
jest.mock("../api/purchases", () => ({ purchaseApi: { submit: jest.fn() } }));
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
beforeEach(() => {
  jest.clearAllMocks();
  propertyApi.list.mockResolvedValue({ items: [property], total: 1 });
});
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
test("requires house and transaction data, reviews before submitting then prevents duplicate clicks", async () => {
  const onSubmitted = jest.fn();
  let resolve;
  purchaseApi.submit.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<PurchaseForm onClose={jest.fn()} onSubmitted={onSubmitted} />);
  fireEvent.click(screen.getByRole("button", { name: "下一步，核对申请" }));
  expect(await screen.findByText("请选择一套在售房源")).toBeInTheDocument();
  expect(purchaseApi.submit).not.toHaveBeenCalled();
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "下一步，核对申请" }));
  await screen.findByRole("heading", { name: "确认购房申请" });
  expect(purchaseApi.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
  fireEvent.click(screen.getByRole("button", { name: "提交中…" }));
  expect(purchaseApi.submit).toHaveBeenCalledTimes(1);
  expect(purchaseApi.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      propertyId: "1",
      propertyVersion: 3,
      dealPrice: 580,
      deposit: 20,
    }),
  );
  await act(async () => {
    resolve({ id: "pa-1", code: "PA-001" });
  });
  await waitFor(() =>
    expect(onSubmitted).toHaveBeenCalledWith({ id: "pa-1", code: "PA-001" }),
  );
});
test("network failure preserves review and uses the same key for unchanged retry", async () => {
  purchaseApi.submit
    .mockRejectedValueOnce(new Error("网络暂时不可用"))
    .mockResolvedValueOnce({ id: "pa-1" });
  render(<PurchaseForm onClose={jest.fn()} onSubmitted={jest.fn()} />);
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "下一步，核对申请" }));
  fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
  await screen.findByText("网络暂时不可用");
  expect(screen.getByText("模拟买方")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
  await waitFor(() => expect(purchaseApi.submit).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认提交" })).toBeEnabled());
  expect(purchaseApi.submit.mock.calls[0][0].submissionKey).toEqual(
    purchaseApi.submit.mock.calls[1][0].submissionKey,
  );
});
test("changed property returns to editing, clears selection and preserves buyer information", async () => {
  purchaseApi.submit.mockRejectedValueOnce(
    Object.assign(new Error("房源资料已变化"), {
      status: 409,
      fields: { propertyId: "请重新选择最新的在售房源" },
    }),
  );
  render(<PurchaseForm onClose={jest.fn()} onSubmitted={jest.fn()} />);
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "下一步，核对申请" }));
  fireEvent.click(screen.getByRole("button", { name: "确认提交" }));
  await screen.findByText("房源资料已变化");
  expect(screen.getByLabelText(/买方姓名/)).toHaveValue("模拟买方");
  expect(screen.queryByText("已选：申请测试房源")).not.toBeInTheDocument();
  expect(await screen.findByRole("radio")).not.toBeChecked();
});
