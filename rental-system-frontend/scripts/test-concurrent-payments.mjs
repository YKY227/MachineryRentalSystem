#!/usr/bin/env node

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  })
);

const baseUrl = args.baseUrl || "http://localhost:3000";
const invoiceId = args.invoice;
const amountCents = Number(args.amount || 0);
const concurrency = Number(args.concurrency || 2);
const cookie = args.cookie || "";
const apiKey = args.apiKey || "";

if (!invoiceId) {
  console.error("Missing --invoice=<invoiceId>");
  process.exit(1);
}

if (!amountCents || amountCents <= 0) {
  console.error("Missing or invalid --amount=<positive integer>");
  process.exit(1);
}

if (!concurrency || concurrency <= 0) {
  console.error("Missing or invalid --concurrency=<positive integer>");
  process.exit(1);
}

const url = `${baseUrl}/api/admin/rental/invoices/${invoiceId}/payments`;

async function sendOne(index) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (cookie) headers["Cookie"] = cookie;
  if (apiKey) headers["x-admin-api-key"] = apiKey;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amountCents,
        method: "test",
        notes: `concurrency-test-${index}`,
      }),
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return {
      index,
      ok: res.ok,
      status: res.status,
      data,
    };
  } catch (error) {
    return {
      index,
      ok: false,
      status: 0,
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function main() {
  console.log(`Testing ${concurrency} concurrent payment requests...`);
  console.log(`URL: ${url}`);
  console.log(`Amount per request: ${amountCents} cents`);
  console.log("");

  const startedAt = Date.now();

  const results = await Promise.all(
    Array.from({ length: concurrency }, (_, i) => sendOne(i + 1))
  );

  const elapsedMs = Date.now() - startedAt;

  const success = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`Completed in ${elapsedMs} ms`);
  console.log(`Success: ${success.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log("");

  console.log("Detailed results:");
  for (const r of results) {
    const message =
      r.data?.error ||
      r.data?.message ||
      r.data?.totals?.status ||
      "OK";

    console.log(
      `#${r.index} -> ${r.ok ? "SUCCESS" : "FAIL"} | status=${r.status} | ${message}`
    );
  }

  console.log("");
  console.log("Success payloads:");
  for (const r of success) {
    console.log(
      `#${r.index}:`,
      JSON.stringify(r.data?.totals || r.data, null, 2)
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});