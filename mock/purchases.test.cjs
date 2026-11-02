const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

test("purchase API validates house selection, idempotency, snapshots and persistence", async (t) => {
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
  const houses = await request(
    "/properties?status=" + encodeURIComponent("在售"),
  );
  const property = houses.data.items[0];
  const payload = {
    submissionKey: "purchase-test-request-1",
    propertyId: property.id,
    propertyVersion: property.version,
    buyerName: "模拟买方",
    buyerPhone: "13800138000",
    dealPrice: 500,
    deposit: 20,
    paymentMethod: "商业贷款",
    expectedSigningDate: "2027-01-15",
    remarks: "接口验收",
  };
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        propertyId: "",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        propertyId: "missing",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        dealPrice: 0,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        deposit: 501,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        expectedSigningDate: "2027-02-30",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        propertyVersion: 999,
      })
    ).status,
    409,
  );
  const sold = (
    await request("/properties?status=" + encodeURIComponent("已售"))
  ).data.items[0];
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        propertyId: sold.id,
        propertyVersion: sold.version,
      })
    ).status,
    409,
  );
  const created = await request("/purchase-applications", "POST", payload);
  assert.equal(created.status, 201);
  assert.equal(created.data.status, "已提交");
  assert.equal(created.data.propertySnapshot.name, property.name);
  assert.equal(created.data.submissionKey, undefined);
  const duplicate = await request("/purchase-applications", "POST", payload);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.id, created.data.id);
  const parallel = await Promise.all([
    request("/purchase-applications", "POST", {
      ...payload,
      submissionKey: "parallel-key",
    }),
    request("/purchase-applications", "POST", {
      ...payload,
      submissionKey: "parallel-key",
    }),
  ]);
  assert.equal(parallel[0].data.id, parallel[1].data.id);
  assert.equal(
    (
      await request("/purchase-applications", "POST", {
        ...payload,
        dealPrice: 600,
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("/properties/" + property.id)).data.status,
    "在售",
  );
  const modified = await request("/properties/" + property.id, "PUT", {
    ...property,
    name: "后续更新的房源名称",
  });
  assert.equal(modified.status, 200);
  assert.equal(
    (await request("/purchase-applications/" + created.data.id)).data
      .propertySnapshot.name,
    property.name,
  );
  assert.equal(
    (
      await request(
        "/purchase-applications?keyword=" +
          encodeURIComponent("模拟买方") +
          "&pageSize=1",
      )
    ).data.items.length,
    1,
  );
  assert.equal((await request("/purchase-applications?page=0")).status, 400);
  assert.equal(
    (await request("/purchase-applications/" + created.data.id, "DELETE", {}))
      .status,
    405,
  );
  await stop();
  base = await start();
  assert.equal(
    (await request("/purchase-applications/" + created.data.id)).data.dealPrice,
    500,
  );
  assert.equal((await request("/purchase-applications")).data.total, 2);
  assert.equal(
    (await request("/properties/" + property.id)).data.name,
    "后续更新的房源名称",
  );
});
