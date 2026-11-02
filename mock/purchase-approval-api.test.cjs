const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

test("single-level review enforces transitions, records decisions, retries safely and migrates legacy submissions", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "property-api-"));
  let child;
  const start = () =>
    new Promise((resolve, reject) => {
      child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
        env: {
          ...process.env,
          MOCK_PORT: "0",
          MOCK_DATA_FILE: path.join(directory, "data.json"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
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
      child.stdout.on("data", (data) => {
        const port = String(data).match(/listening on (\d+)/)?.[1];
        if (port) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${port}/api/v1`);
        }
      });
    });
  const stop = () =>
    new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
  t.after(async () => {
    if (child && child.exitCode === null) await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  let base = await start();
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
  const first = (await request("/purchase-applications", "POST", payload)).data;
  assert.equal(first.status, "待审核");
  assert.equal(first.version, 1);
  assert.equal(first.history.length, 1);
  const route = `/purchase-applications/${first.id}/approvals`;
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
  const approved = await request(route, "POST", approval);
  assert.equal(approved.status, 200);
  assert.equal(approved.data.status, "已通过");
  assert.equal(approved.data.version, 2);
  assert.equal(approved.data.history[1].actor, "演示审核员");
  assert.equal(approved.data.history[1].comment, "核验资料通过");
  assert.equal(approved.data.history[1].requestKey, undefined);
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
  const filtered = await request(
    "/purchase-applications?status=" + encodeURIComponent("已驳回"),
  );
  assert.ok(filtered.data.items.every((row) => row.status === "已驳回"));
  assert.ok(filtered.data.summary.rejected >= 1);
  assert.equal(
    (await request("/purchase-applications?status=invalid")).status,
    400,
  );
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
