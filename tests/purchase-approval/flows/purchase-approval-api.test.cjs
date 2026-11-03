const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

/**
 * 集成场景：验证一级审批状态机、原因必填、并发冲突、重试去重和旧数据兼容。
 * 预期：同一申请只完成一次审批；决定及意见留档，通过不售出房源；旧“已提交”数据可迁移为待审核。
 * 并发测试不依赖具体哪个请求先完成，因此另设独立驳回场景覆盖对应分支。
 */
test("single-level review enforces transitions, records decisions, retries safely and migrates legacy submissions", async (t) => {
  // 准备：每个测试独占临时目录和数据文件，避免写入开发中的房源与申请。
  const directory = mkdtempSync(path.join(tmpdir(), "property-api-"));
  let child;
  /**
   * 启动真实 API 子进程，使用随机端口和当前测试专属的数据文件。
   * 等待服务输出监听端口后才继续；启动超时或异常退出使测试失败。
   * @returns {Promise<string>} 带 /api/v1 前缀的本次服务地址。
   */
  const start = () =>
    new Promise((resolve, reject) => {
      child = spawn(
        process.execPath,
        [path.join(__dirname, "../../../mock/server.cjs")],
        {
          env: {
            ...process.env,
            MOCK_PORT: "0",
            MOCK_DATA_FILE: path.join(directory, "data.json"),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      // 就绪等待有时间上限，服务未启动不能被误判为接口通过。
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("API startup timeout"));
      }, 10000);
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code) {
          clearTimeout(timer);
          reject(new Error(`API exited ${code}`));
        }
      });
      // 以服务实际监听端口为准，避免使用固定端口导致并发测试冲突。
      child.stdout.on("data", (data) => {
        const port = String(data).match(/listening on (\d+)/)?.[1];
        if (port) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${port}/api/v1`);
        }
      });
    });
  /**
   * 终止当前测试启动的 API 子进程，并等待退出后再重启或清理数据文件。
   * 不影响工作台上运行的开发服务。
   * @returns {Promise<void>} 子进程退出后完成。
   */
  const stop = () =>
    new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
  // 无论用例成功还是失败，都清理本测试启动的进程及临时文件。
  t.after(async () => {
    if (child && child.exitCode === null) await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  let base = await start();
  /**
   * 向隔离服务发送真实 HTTP 请求，同时保留状态码和业务响应供断言。
   * 仅在有 payload 时设置 JSON 请求体，204 不尝试解析 JSON。
   * @param {string} route 相对于 /api/v1 的请求路径。
   * @param {string} method HTTP 方法，默认 GET。
   * @param {object} payload 可选的 JSON 请求体。
   * @returns {Promise<object>} { status, data }，204 的 data 为 null。
   */
  const request = async (route, method = "GET", payload) => {
    const res = await fetch(base + route, {
      method,
      ...(payload !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        : {}),
    });
    return {
      status: res.status,
      data: res.status === 204 ? null : await res.json(),
    };
  };
  // 读取实际在售房源，为审批状态机准备一份有效申请。
  const property = (
    await request("/properties?status=" + encodeURIComponent("在售"))
  ).data.items[0];
  const payload = {
    submissionKey: "review-source-1",
    propertyId: property.id,
    propertyVersion: property.version,
    buyerName: "审核测试买方",
    buyerPhone: "13800138000",
    dealPrice: 600,
    deposit: 20,
    paymentMethod: "全款",
    expectedSigningDate: "2027-01-15",
    remarks: "",
  };
  // 申请初始应是待审核、版本 1，并已有一条提交记录。
  const first = (await request("/purchase-applications", "POST", payload)).data;
  assert.equal(first.status, "待审核");
  assert.equal(first.version, 1);
  assert.equal(first.history.length, 1);
  const route = `/purchase-applications/${first.id}/approvals`;
  // 固定审批请求标识，便于区分原请求重试和另一次审批。
  const approval = {
    decision: "approve",
    comment: "核验资料通过",
    version: 1,
    requestKey: "review-1",
  };
  assert.equal(
    (await request(route, "POST", { ...approval, decision: "invalid" })).status,
    422,
  );
  assert.equal(
    (
      await request(route, "POST", {
        ...approval,
        decision: "reject",
        comment: " ",
      })
    ).status,
    422,
  );
  assert.equal(
    (await request(route, "POST", { ...approval, version: 99 })).status,
    409,
  );
  // 通过后检查状态、版本、处理人及意见，同时确认内部幂等字段没有泄漏。
  const approved = await request(route, "POST", approval);
  assert.equal(approved.status, 200);
  assert.equal(approved.data.status, "已通过");
  assert.equal(approved.data.version, 2);
  assert.equal(approved.data.history[1].actor, "演示审核员");
  assert.equal(approved.data.history[1].comment, "核验资料通过");
  assert.equal(approved.data.history[1].requestKey, undefined);
  // 相同请求重试及旧接口别名必须返回原结果，不能重复追加审批。
  assert.equal((await request(route, "POST", approval)).status, 200);
  assert.equal(
    (await request(route.replace("/approvals", "/reviews"), "POST", approval))
      .status,
    200,
  );
  assert.equal(
    (
      await request(route, "POST", {
        ...approval,
        decision: "reject",
        comment: "变更意见",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(route, "POST", {
        ...approval,
        requestKey: "second-review",
        version: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("/properties/" + property.id)).data.status,
    "在售",
  );
  // 另建申请让通过与驳回竞争；只断言一个成功、一个冲突，不依赖网络调度顺序。
  const second = (
    await request("/purchase-applications", "POST", {
      ...payload,
      submissionKey: "review-source-2",
    })
  ).data;
  const results = await Promise.all([
    request(`/purchase-applications/${second.id}/approvals`, "POST", {
      decision: "reject",
      comment: "资料不齐全",
      version: 1,
      requestKey: "reject-1",
    }),
    request(`/purchase-applications/${second.id}/approvals`, "POST", {
      decision: "approve",
      comment: "",
      version: 1,
      requestKey: "approve-2",
    }),
  ]);
  assert.equal(results.filter((result) => result.status === 200).length, 1);
  assert.equal(results.filter((result) => result.status === 409).length, 1);
  // An independent rejection guarantees the rejected branch is exercised, regardless of race winner.
  // 独立场景：先改变房源资料，确认不能批准旧申请，但仍可以说明原因后驳回。
  const third = (
    await request("/purchase-applications", "POST", {
      ...payload,
      submissionKey: "review-source-3",
    })
  ).data;
  await request("/properties/" + property.id, "PUT", {
    ...property,
    name: "房源资料已变更",
  });
  const thirdRoute = `/purchase-applications/${third.id}/approvals`;
  assert.equal(
    (
      await request(thirdRoute, "POST", {
        ...approval,
        requestKey: "stale-property",
      })
    ).status,
    409,
  );
  const rejected = await request(thirdRoute, "POST", {
    decision: "reject",
    comment: "房源资料变化，请重新申请",
    version: 1,
    requestKey: "reject-3",
  });
  assert.equal(rejected.data.status, "已驳回");
  assert.equal(rejected.data.history.length, 2);
  // 审批状态筛选只影响列表；全库统计仍能反映已驳回申请。
  const filtered = await request(
    "/purchase-applications?status=" + encodeURIComponent("已驳回"),
  );
  assert.ok(filtered.data.items.every((row) => row.status === "已驳回"));
  assert.ok(filtered.data.summary.rejected >= 1);
  assert.equal(
    (await request("/purchase-applications?status=invalid")).status,
    400,
  );
  // 停服后构造旧版“已提交”记录，缺失版本和历史，用重启验证真实迁移路径。
  await stop();
  const fs = require("node:fs"),
    filename = path.join(directory, "data.json");
  const database = JSON.parse(fs.readFileSync(filename, "utf8"));
  database.purchaseApplications.push({
    ...first,
    id: "legacy-1",
    status: "已提交",
    version: undefined,
    history: undefined,
    submissionKey: "legacy-key",
  });
  fs.writeFileSync(filename, JSON.stringify(database));
  base = await start();
  // 迁移应补齐待审核状态、版本与提交历史，同时保留已完成审批和最新房源。
  const legacy = (await request("/purchase-applications/legacy-1")).data;
  assert.equal(legacy.status, "待审核");
  assert.equal(legacy.version, 1);
  assert.equal(legacy.history[0].action, "提交申请");
  const persisted = (await request(`/purchase-applications/${third.id}`)).data;
  assert.equal(persisted.status, "已驳回");
  assert.equal(persisted.history[1].comment, "房源资料变化，请重新申请");
  assert.equal(
    (await request("/properties/" + property.id)).data.name,
    "房源资料已变更",
  );
});
