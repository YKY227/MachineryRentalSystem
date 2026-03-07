import fs from "node:fs";
import path from "node:path";

const logPath = path.resolve(process.cwd(), "docs", "migration-log.md");
const date = new Date().toISOString().slice(0, 10);

if (!fs.existsSync(logPath)) {
  throw new Error(`Missing migration log: ${logPath}`);
}

const stub = `
## ${date} | Scope: module
Summary:
- 

Files changed:
- 

DB/Infra changes:
- None.

API changes:
- None.

Manual test checklist:
- [ ] 
- [ ] 
- [ ] 

Rollback notes:
- Optional.
`;

fs.appendFileSync(logPath, `\n${stub}`, "utf8");
console.log(`Added migration stub to ${logPath}`);
