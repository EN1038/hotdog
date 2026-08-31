import "dotenv/config";
import {
  backfillAllStoreMissingProductCodes,
  MENU_ITEM_CODE_START,
} from "../src/lib/inventory/inventory-menu-code-backfill";

function assertBackfillAllowed() {
  const url = process.env.DATABASE_URL ?? "";
  const allow = process.env.ALLOW_ITEM_CODE_BACKFILL === "1";
  const looksRemote =
    /ondigitalocean|amazonaws|\.rds\.|railway|supabase|neon\.tech|render\.com/i.test(
      url,
    );
  const isProd = process.env.NODE_ENV === "production";

  if ((isProd || looksRemote) && !allow) {
    console.error(
      [
        "Refusing to backfill item codes: target looks like production/remote.",
        "Set ALLOW_ITEM_CODE_BACKFILL=1 to proceed.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const reassign = argv.includes("--reassign");
  const branchArg = argv.find((a) => a.startsWith("--branch="));
  const brandArg = argv.find((a) => a.startsWith("--brand="));
  return {
    dryRun,
    reassign,
    branchId: branchArg?.slice("--branch=".length).trim() || undefined,
    brandId: brandArg?.slice("--brand=".length).trim() || undefined,
  };
}

async function main() {
  assertBackfillAllowed();
  const opts = parseArgs(process.argv.slice(2));

  const { branches, totalUpdated, totalMenuUpdated, totalNonMenuUpdated } =
    await backfillAllStoreMissingProductCodes({
      dryRun: opts.dryRun,
      reassignEligibleMenu: opts.reassign,
      branchId: opts.branchId,
      brandId: opts.brandId,
    });

  if (branches.length === 0) {
    console.log("No items missing product codes.");
    return;
  }

  for (const row of branches) {
    console.log(
      `${opts.dryRun ? "[dry-run] " : ""}${row.branchName}: ${row.updated} codes (เมนู ${row.menuUpdated} · อื่นๆ ${row.nonMenuUpdated}) → ${row.startCode ?? "—"} … ${row.endCode ?? "—"}`,
    );
    for (const sample of row.samples) {
      const kind = sample.kind === "menu" ? "เมนู" : "สิ้นเปลือง/อื่น";
      const prev = sample.previousCode ?? "—";
      console.log(`  [${kind}] ${sample.itemCode} ← ${prev} · ${sample.name}`);
    }
    if (row.updated > row.samples.length) {
      console.log(`  … +${row.updated - row.samples.length} more`);
    }
  }

  console.log(
    opts.dryRun
      ? "Dry run complete — no changes written."
      : `Done. Assigned ${totalUpdated} codes (เมนู ${totalMenuUpdated} · สิ้นเปลือง/อื่น ${totalNonMenuUpdated}; base ${MENU_ITEM_CODE_START} per branch).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
