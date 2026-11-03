import { installBrowserMocks } from "../../shared/helpers/browserMocks";
import {
  createPropertyFixture,
  createPropertyFormValues,
} from "../fixtures/propertyComponentFixtures";
import { configurePropertyApiMock } from "../mocks/propertyApiMock";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import PropertyManagementPage from "../../../src/pages/property-management/PropertyManagementPage";
import { propertyApi } from "../../../src/api/propertyApi";

// 替换网络边界，页面仍执行真实 Hook、校验和交互逻辑；HTTP 契约由接口集成测试覆盖。
jest.mock("../../../src/api/propertyApi", () =>
  require("../mocks/propertyApiMock").createPropertyApiMock(),
);
// 固定房源基线；每个用例重新复制，避免修改对象使后续断言失真。
const fixture = createPropertyFixture();
let mockState;
/**
 * 提供当前 JSDOM 环境缺少的原生浏览器方法，保证测试运行生产弹窗逻辑。
 * 这些替身只模拟打开/关闭属性，不验证浏览器原生焦点与遮罩行为。
 */
beforeAll(() => installBrowserMocks({ includeCrypto: false }));
/**
 * 每个用例重置内存房源和 API Mock，避免增删改结果在用例之间串扰。
 * 模拟查询仅实现本测试需要的关键词、分页和统计，不替代后端集成测试。
 */
beforeEach(() => {
  jest.clearAllMocks();
  mockState = configurePropertyApiMock(propertyApi, fixture);
});
/**
 * 通过可访问标签填写一份完整有效的房源表单，模拟真实控件输入。
 * 保留数值为字符串，便于后续断言生产代码是否转换为数字。
 */
function fillForm() {
  const values = createPropertyFormValues();
  for (const [label, value] of Object.entries(values))
    fireEvent.change(
      screen.getByLabelText(new RegExp(label.replace(/[()（）]/g, "\\$&"))),
      { target: { value } },
    );
}
/**
 * 场景：房源新增、编辑和确认删除后，页面与接口数据保持同步。
 * 准备：使用可写内存记录模拟 API，初始只有一条房源。
 * 操作：先提交空表单，再填写新增，编辑名称，最后确认删除。
 * 预期：无效表单不调用新增接口；金额转换为数字；列表反映每次成功操作，删除前必须确认。
 */
test("create, edit and confirmed delete update visible list using API", async () => {
  render(<PropertyManagementPage />);
  await screen.findByText("测试房源");
  fireEvent.click(screen.getByRole("button", { name: /新增房源/ }));
  fireEvent.click(screen.getByRole("button", { name: "保存房源" }));
  expect(await screen.findByText("请输入房源名称")).toBeInTheDocument();
  expect(propertyApi.create).not.toHaveBeenCalled();
  // 补齐表单后再次保存，断言字符串输入中的金额和房间数已转换为数字。
  fillForm();
  fireEvent.click(screen.getByRole("button", { name: "保存房源" }));
  await screen.findByText("新增房源示例");
  expect(propertyApi.create).toHaveBeenCalledWith(
    expect.objectContaining({ area: 88, price: 300, rooms: 2 }),
  );
  // 限定到新房源所在行操作，防止误点击其他行也让测试看似通过。
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
  // 打开删除确认窗口还不能调用接口，只有明确确认后才允许删除。
  expect(propertyApi.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
  await waitFor(() =>
    expect(screen.queryByText("修改后的房源")).not.toBeInTheDocument(),
  );
  expect(propertyApi.delete).toHaveBeenCalledWith("2", 1);
});
/**
 * 场景：查询无结果后发生加载错误，用户仍可重试恢复。
 * 操作：搜索不存在的房源，重置时模拟一次请求失败，再点击重新加载。
 * 预期：空状态与错误提示分别展示，重试后重新看到原房源。
 */
test("search, empty state and API failure recovery", async () => {
  render(<PropertyManagementPage />);
  await screen.findByText("测试房源");
  fireEvent.change(screen.getByLabelText("搜索房源"), {
    target: { value: "不存在的房源" },
  });
  fireEvent.click(screen.getByRole("button", { name: "查询" }));
  await screen.findByText("暂无符合条件的房源");
  // 只令下一次查询失败；保留默认成功响应，以检验重试是否真的恢复。
  propertyApi.getList.mockRejectedValueOnce(new Error("服务暂不可用"));
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  await screen.findByText("服务暂不可用");
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  await screen.findByText("测试房源");
});
/**
 * 场景：新增接口保存失败。
 * 准备：仅令本次新增请求失败，列表查询保持正常。
 * 预期：展示后端错误、保留房源输入并恢复保存按钮，便于用户重试。
 */
test("failed save retains form input and shows backend error", async () => {
  propertyApi.create.mockRejectedValueOnce(new Error("服务保存失败"));
  render(<PropertyManagementPage />);
  await screen.findByText("测试房源");
  fireEvent.click(screen.getByRole("button", { name: /新增房源/ }));
  fillForm();
  fireEvent.click(screen.getByRole("button", { name: "保存房源" }));
  await screen.findByText("服务保存失败");
  expect(screen.getByLabelText(/房源名称/)).toHaveValue("新增房源示例");
  expect(screen.getByRole("button", { name: "保存房源" })).toBeEnabled();
});

/**
 * 场景：九条记录、每页八条，在第二页删除唯一一条。
 * 操作：模拟用户翻页、确认删除。
 * 预期：自动回到第一页且前后翻页按钮均禁用，不能停留在不存在的页码。
 */
test("deleting the final record on the last page returns to a valid page", async () => {
  // 制造两页数据，第二页恰好一条，用于覆盖删除后页码回退边界。
  mockState.rows = Array.from({ length: 9 }, (_, index) => ({
    ...fixture,
    id: String(index + 1),
    name: `分页房源${index + 1}`,
  }));
  render(<PropertyManagementPage />);
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

/**
 * 场景：编辑时服务端报告 409 版本冲突。
 * 预期：提交读取时的版本；展示冲突且保留用户输入，不假装保存成功。
 */
test("stale edit is surfaced without closing the form or discarding input", async () => {
  propertyApi.update.mockRejectedValueOnce(
    Object.assign(new Error("房源已被其他操作更新"), { status: 409 }),
  );
  render(<PropertyManagementPage />);
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
