import fs from "node:fs";
import path from "node:path";

const logPath = path.resolve(process.cwd(), "docs", "migration-log.md");
const date = new Date().toISOString().slice(0, 10);

const scopeArgIndex = process.argv.findIndex((arg) => arg === "--scope");
const scope =
  scopeArgIndex > -1 && process.argv[scopeArgIndex + 1]
    ? process.argv[scopeArgIndex + 1]
    : "module";

if (!fs.existsSync(logPath)) {
  throw new Error(`Missing migration log: ${logPath}`);
}

const template = `
## ${date} | Scope: ${scope}
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

fs.appendFileSync(logPath, `\n${template}`, "utf8");
console.log(`Appended migration template to ${logPath}`);
