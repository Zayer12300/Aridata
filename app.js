/* ============================================================
   Aridata — Requirements-Driven Workflow Engine
   (append to existing inline script or load before it)
   ============================================================ */

// ─────────────────────────────────────────────────────────────────────────────
// 1. REQUIREMENTS REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
const REQUIREMENTS = {
  headers: {
    requiredColumns: ["ContractId", "Title", "Supplier", "EffectiveDate", "ExpirationDate", "Amount"],
    optionalColumns: ["ParentAgreement", "Client", "Region", "BusinessSystem", "ProposedAmount"],
    keyFields: ["ContractId"],
    businessRules: [
      { id: "HDR-001", severity: "error", category: "mandatory", field: "ContractId",
        message: "ContractId is mandatory.",
        validate: row => String(row.ContractId ?? "").trim() !== "" },
      { id: "HDR-002", severity: "warn", category: "data-quality", field: "Supplier",
        message: "Supplier is missing.",
        validate: row => String(row.Supplier ?? "").trim() !== "" },
      { id: "HDR-003", severity: "error", category: "date-validation", field: "EffectiveDate",
        message: "EffectiveDate format is invalid (expected MM/DD/YYYY).",
        validate: row => {
          const v = String(row.EffectiveDate ?? "").trim();
          return v && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v);
        }},
      { id: "HDR-004", severity: "error", category: "date-validation", field: "ExpirationDate",
        message: "ExpirationDate format is invalid (expected MM/DD/YYYY).",
        validate: row => {
          const v = String(row.ExpirationDate ?? "").trim();
          return v && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v);
        }},
      { id: "HDR-005", severity: "warn", category: "date-validation", field: "ExpirationDate",
        message: "ExpirationDate is in the past.",
        validate: row => {
          const v = String(row.ExpirationDate ?? "").trim();
          if (!v || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return true;
          const [m, d, y] = v.split("/").map(Number);
          return new Date(y, m - 1, d) >= new Date();
        }},
      { id: "HDR-006", severity: "error", category: "amount-validation", field: "Amount",
        message: "Amount must be a valid non-negative number.",
        validate: row => { const n = Number(row.Amount); return Number.isFinite(n) && n >= 0; }}
    ]
  },
  items: {
    requiredColumns: ["contract_id", "item_number", "description", "quantity", "unit_price"],
    optionalColumns: ["plant", "material_number", "material_group"],
    keyFields: ["contract_id", "item_number"],
    businessRules: [
      { id: "ITM-001", severity: "error", category: "mandatory", field: "contract_id",
        message: "contract_id is mandatory.",
        validate: row => String(row.contract_id ?? "").trim() !== "" },
      { id: "ITM-002", severity: "error", category: "mandatory", field: "item_number",
        message: "item_number is mandatory.",
        validate: row => String(row.item_number ?? "").trim() !== "" },
      { id: "ITM-003", severity: "warn", category: "data-quality", field: "quantity",
        message: "quantity must be a valid non-negative number.",
        validate: row => { const n = Number(row.quantity); return Number.isFinite(n) && n >= 0; }},
      { id: "ITM-004", severity: "warn", category: "amount-validation", field: "unit_price",
        message: "unit_price must be a valid non-negative number.",
        validate: row => { const n = Number(row.unit_price); return Number.isFinite(n) && n >= 0; }}
    ]
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. WORKFLOW STATE MACHINE
// ─────────────────────────────────────────────────────────────────────────────
const WORKFLOW = {
  headers: { stage: "idle", canPreview: false, canValidate: false, canGenerate: false, errors: 0, warnings: 0, issues: [] },
  items:   { stage: "idle", canPreview: false, canValidate: false, canGenerate: false, errors: 0, warnings: 0, issues: [] }
};

const STAGE_MAP = {
  idle:                { canPreview: false, canValidate: false, canGenerate: false },
  uploaded:            { canPreview: true,  canValidate: true,  canGenerate: false },
  structure_validated: { canPreview: true,  canValidate: true,  canGenerate: false },
  business_validated:  { canPreview: true,  canValidate: true,  canGenerate: true  },
  reviewed:           { canPreview: true,  canValidate: true,  canGenerate: true  },
  generated:          { canPreview: true,  canValidate: true,  canGenerate: true  }
};

function setWorkflowStage(area, stage) {
  const wf = WORKFLOW[area];
  wf.stage = stage;
  const perms = STAGE_MAP[stage] || STAGE_MAP.idle;
  Object.assign(wf, perms);
  syncWorkflowButtons(area);
  const stageLabels = {
    idle: "Idle", uploaded: "File Loaded", structure_validated: "Structure OK",
    business_validated: "Validated", reviewed: "Reviewed", generated: "Generated"
  };
  setStatus(ui[area], wf.stage === "idle" ? "idle" : "success", stageLabels[stage] || stage);
}

function syncWorkflowButtons(area) {
  const wf = WORKFLOW[area];
  const u = ui[area];
  if (u.preview) u.preview.disabled = !wf.canPreview;
  if (u.validate) u.validate.disabled = !wf.canValidate;
  if (u.run) u.run.disabled = !wf.canGenerate;
}

function resetWorkflow(area) {
  const wf = WORKFLOW[area];
  wf.stage = "idle"; wf.errors = 0; wf.warnings = 0; wf.issues = [];
  setWorkflowStage(area, "idle");
}

function summarizeIssues(issues) {
  return {
    errors:   issues.filter(x => x.severity === "error").length,
    warnings: issues.filter(x => x.severity === "warn").length,
    info:     issues.filter(x => x.severity === "info").length,
    total: issues.length
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. VALIDATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────
function validateRequiredColumns(rows, requiredColumns, scope) {
  const issues = [];
  if (!rows || !rows.length) {
    issues.push({ severity: "error", code: `${scope}-EMPTY`, scope, message: "No data rows found." });
    return issues;
  }
  const columns = Object.keys(rows[0]);
  for (const col of requiredColumns) {
    if (!columns.includes(col)) {
      issues.push({ severity: "error", code: `${scope}-MISSING-COL`, scope, field: col, message: `Required column missing: ${col}` });
    }
  }
  return issues;
}

function validateRules(rows, rules, scope) {
  const issues = [];
  rows.forEach((row, idx) => {
    rules.forEach(rule => {
      if (!rule.validate(row)) {
        issues.push({
          severity: rule.severity, code: rule.id, field: rule.field, category: rule.category,
          scope: `${scope} Row ${idx + 2}`, message: rule.message
        });
      }
    });
  });
  return issues;
}

function validateDuplicateKeys(rows, keyFields, scope) {
  const issues = [], seen = new Set();
  rows.forEach((row, idx) => {
    const key = keyFields.map(f => String(row[f] ?? "").trim()).join("||");
    if (!key.replace(/\|/g, "")) return;
    if (seen.has(key)) {
      issues.push({ severity: "warn", code: `${scope}-DUPLICATE`, scope, field: keyFields.join("+"), message: `Duplicate key: ${key}` });
    }
    seen.add(key);
  });
  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PIPELINE RUNNERS
// ─────────────────────────────────────────────────────────────────────────────
function runHeaderValidationPipeline(rows) {
  const cfg = REQUIREMENTS.headers;
  const allIssues = [
    ...validateRequiredColumns(rows, cfg.requiredColumns, "Headers"),
    ...validateRules(rows, cfg.businessRules, "Header"),
    ...validateDuplicateKeys(rows, cfg.keyFields, "Headers")
  ];
  return { issues: allIssues, hasBlocking: allIssues.some(i => i.severity === "error"), passed: !allIssues.some(i => i.severity === "error") };
}

function runItemValidationPipeline(rows) {
  const cfg = REQUIREMENTS.items;
  const allIssues = [
    ...validateRequiredColumns(rows, cfg.requiredColumns, "LineItems"),
    ...validateRules(rows, cfg.businessRules, "LineItem"),
    ...validateDuplicateKeys(rows, cfg.keyFields, "LineItems")
  ];
  return { issues: allIssues, hasBlocking: allIssues.some(i => i.severity === "error"), passed: !allIssues.some(i => i.severity === "error") };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. GATE KEEP
// ─────────────────────────────────────────────────────────────────────────────
function canProceedWithWarnings(issues) {
  const errors = issues.filter(i => i.severity === "error");
  if (errors.length) return false;
  const warnings = issues.filter(i => i.severity === "warn");
  if (!warnings.length) return true;
  return confirm(`Validation found ${warnings.length} warning(s). Continue to generate output?`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ISSUE DISPLAY (updates the existing #issueList element)
// ─────────────────────────────────────────────────────────────────────────────
function renderIssues(issues) {
  const container = document.getElementById("issueList");
  if (!container) return;
  const sum = summarizeIssues(issues);

  if (!issues.length) {
    container.innerHTML = `<div class="issues-clean">
      <div class="issues-clean-icon">✓</div>
      <div class="issues-clean-title">All checks passed</div>
      <div class="issues-clean-sub">No validation issues found.</div>
    </div>`;
    return;
  }

  let html = `<div class="issues-summary">
    <span class="issues-badge issues-badge-error">${sum.errors} Error${sum.errors !== 1 ? "s" : ""}</span>
    <span class="issues-badge issues-badge-warn">${sum.warnings} Warning${sum.warnings !== 1 ? "s" : ""}</span>
  </div><div class="issues-list">`;

  issues.forEach(issue => {
    const sev = issue.severity === "error" ? "error" : issue.severity === "warn" ? "warning" : "info";
    html += `<div class="issue-row issue-${sev}">
      <span class="issue-sev">${sev.toUpperCase()}</span>
      ${issue.code ? `<span class="issue-code">${issue.code}</span>` : ""}
      <span class="issue-msg">${issue.message}</span>
      ${issue.field ? `<span class="issue-field">${issue.field}</span>` : ""}
    </div>`;
  });

  html += "</div>";
  container.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. HELPERS (mirrors existing inline helpers — safe to override/add)
// ─────────────────────────────────────────────────────────────────────────────
function parseCsvText(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    const vals = [], cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    vals.push(cur.trim());
    return vals;
  });
}

function parseCsvWithHeader(text, headerIdx = 0) {
  const lines = parseCsvText(text);
  if (headerIdx >= lines.length) return [];
  const headers = lines[headerIdx].map(h => h.replace(/^"|"$/g, "").trim());
  return lines.slice(headerIdx + 1).filter(row => row.some(v => v.trim() !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ""; });
      return obj;
    });
}
