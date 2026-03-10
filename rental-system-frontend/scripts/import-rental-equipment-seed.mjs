const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const adminKey = (process.env.ADMIN_API_KEY || "").trim();

if (!adminKey) {
  console.error("Missing ADMIN_API_KEY in environment.");
  process.exit(1);
}

const endpoint = `${baseUrl}/api/admin/rental/equipment/import-seed`;

async function main() {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-admin-key": adminKey,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Equipment import failed.");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(`Import source: ${data.importedFrom}`);
  console.log(`Merge policy: ${data.mergePolicy}`);
  console.log(`Inserted: ${data.inserted}`);
  console.log(`Updated: ${data.updated}`);
  console.log(`Skipped: ${data.skipped}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Equipment import failed");
  process.exit(1);
});
