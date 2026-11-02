import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import PropertiesPage from "./PropertiesPage";
import { propertyApi } from "../../api/properties";

jest.mock("../../api/properties", () => ({
  propertyApi: {
    list: jest.fn(),
    detail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));
const fixture = {
  id: "1",
  code: "RE-001",
  name: "测试房源",
  city: "上海",
  district: "浦东新区",
  address: "测试路1号",
  type: "住宅",
  status: "在售",
  area: 100,
  price: 500,
  rooms: 3,
  contact: "林经理",
  phone: "13800138000",
  description: "",
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
let rows;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  rows = [{ ...fixture }];
  propertyApi.list.mockImplementation(async (query) => {
    const filtered = rows.filter(
      (row) => !query.keyword || row.name.includes(query.keyword),
    );
    return {
      items: filtered.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      total: filtered.length,
      summary: {
        total: rows.length,
        forSale: rows.length,
        sold: 0,
        totalPrice: rows.reduce((sum, row) => sum + row.price, 0),
      },
    };
  });
  propertyApi.detail.mockImplementation(async (id) =>
    rows.find((row) => row.id === id),
  );
  propertyApi.create.mockImplementation(async (data) => {
    rows.push({ ...fixture, ...data, id: "2" });
  });
  propertyApi.update.mockImplementation(async (id, data) => {
    rows = rows.map((row) => (row.id === id ? { ...row, ...data } : row));
  });
  propertyApi.remove.mockImplementation(async (id) => {
    rows = rows.filter((row) => row.id !== id);
  });
});
function fillForm() {
  const values = {
    房源名称: "新增房源示例",
    城市: "杭州",
    区域: "滨江区",
    详细地址: "江南大道1号",
    "建筑面积（㎡）": "88",
    "总价（万元）": "300",
    房间数: "2",
    联系人: "王经理",
    联系电话: "13900139000",
  };
  for (const [label, value] of Object.entries(values))
    fireEvent.change(
      screen.getByLabelText(new RegExp(label.replace(/[()（）]/g, "\\$&"))),
      { target: { value } },
    );
}
test("create, edit and confirmed delete update visible list using API", async () => {
  render(<PropertiesPage />);
  await screen.findByText("测试房源");
  fireEvent.click(screen.getByRole("button", { name: /新增房源/ }));
  fireEvent.click(screen.getByRole("button", { name: "保存房源" }));
  expect(await screen.findByText("请输入房源名称")).toBeInTheDocument();
  expect(propertyApi.create).not.toHaveBeenCalled();
  fillForm();
  fireEvent.click(screen.getByRole("button", { name: "保存房源" }));
  await screen.findByText("新增房源示例");
  expect(propertyApi.create).toHaveBeenCalledWith(
    expect.objectContaining({ area: 88, price: 300, rooms: 2 }),
  );
  const row = screen.getByText("新增房源示例").closest("tr");
  fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
  const nameInput = await screen.findByLabelText(/房源名称/);
  fireEvent.change(nameInput, { target: { value: "修改后的房源" } });
  fireEvent.click(screen.getByRole("button", { name: "保存房源" }));
  await screen.findByText("修改后的房源");
  fireEvent.click(
    within(screen.getByText("修改后的房源").closest("tr")).getByRole("button", {
      name: "删除",
    }),
  );
  await screen.findByRole("button", { name: "确认删除" });
  expect(propertyApi.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
  await waitFor(() =>
    expect(screen.queryByText("修改后的房源")).not.toBeInTheDocument(),
  );
  expect(propertyApi.remove).toHaveBeenCalledWith("2", 1);
});
test("search, empty state and API failure recovery", async () => {
  render(<PropertiesPage />);
  await screen.findByText("测试房源");
  fireEvent.change(screen.getByLabelText("搜索房源"), {
    target: { value: "不存在的房源" },
  });
  fireEvent.click(screen.getByRole("button", { name: "查询" }));
  await screen.findByText("暂无符合条件的房源");
  propertyApi.list.mockRejectedValueOnce(new Error("服务暂不可用"));
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  await screen.findByText("服务暂不可用");
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  await screen.findByText("测试房源");
});
test("failed save retains form input and shows backend error", async () => {
  propertyApi.create.mockRejectedValueOnce(new Error("服务保存失败"));
  render(<PropertiesPage />);
  await screen.findByText("测试房源");
  fireEvent.click(screen.getByRole("button", { name: /新增房源/ }));
  fillForm();
  fireEvent.click(screen.getByRole("button", { name: "保存房源" }));
  await screen.findByText("服务保存失败");
  expect(screen.getByLabelText(/房源名称/)).toHaveValue("新增房源示例");
  expect(screen.getByRole("button", { name: "保存房源" })).toBeEnabled();
});

test("deleting the final record on the last page returns to a valid page", async () => {
  rows = Array.from({ length: 9 }, (_, index) => ({
    ...fixture,
    id: String(index + 1),
    name: `分页房源${index + 1}`,
  }));
  render(<PropertiesPage />);
  await screen.findByText("分页房源1");
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  const last = await screen.findByText("分页房源9");
  fireEvent.click(
    within(last.closest("tr")).getByRole("button", { name: "删除" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));
  await screen.findByText("分页房源1");
  expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
});

test("stale edit is surfaced without closing the form or discarding input", async () => {
  propertyApi.update.mockRejectedValueOnce(
    Object.assign(new Error("房源已被其他操作更新"), { status: 409 }),
  );
  render(<PropertiesPage />);
  await screen.findByText("测试房源");
  fireEvent.click(screen.getByRole("button", { name: "编辑" }));
  fireEvent.change(await screen.findByLabelText(/房源名称/), {
    target: { value: "保留我的修改" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存房源" }));
  await screen.findByText("房源已被其他操作更新");
  expect(screen.getByLabelText(/房源名称/)).toHaveValue("保留我的修改");
  expect(propertyApi.update).toHaveBeenCalledWith(
    "1",
    expect.objectContaining({ version: 1 }),
  );
});
