import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const catalog = JSON.parse(read("catalog.json"));
const llms = read("llms.txt");
const index = read("index.html");
const readme = read("README.md");
const support = read("SUPPORT.md");
const sitemap = read("sitemap.xml");

assert.equal(catalog.commercial_model, "recurring_only");
assert.equal(catalog.public_checkout, false);
assert.equal(catalog.github_sponsors_active, false);
assert.ok(Array.isArray(catalog.offers) && catalog.offers.length > 0);

const ids = catalog.offers.map(({ id }) => id);
assert.equal(new Set(ids).size, ids.length, "catalog offer IDs must be unique");

for (const offer of catalog.offers) {
  assert.equal(offer.recurring, true, `${offer.id}: recurring must be true`);
  assert.equal(offer.one_time_checkout, false, `${offer.id}: one-time checkout must be false`);
  assert.equal(offer.status, "qualification_required", `${offer.id}: qualification must be required`);
  assert.equal(offer.mandate_required, true, `${offer.id}: mandate must be required`);
  assert.equal(offer.cancellation_path_required, true, `${offer.id}: cancellation path must be required`);
  assert.equal(offer.material_change_reacceptance_required, true, `${offer.id}: material changes must require reacceptance`);
  assert.deepEqual(offer.supported_billing_periods, ["month", "year"], `${offer.id}: billing periods drifted`);
  assert.equal(llms.split(`\`${offer.id}\``).length - 1, 1, `${offer.id}: llms.txt must expose the ID exactly once`);
  assert.ok(llms.includes(offer.name), `${offer.id}: llms.txt name drifted`);
  assert.ok(llms.includes("(`" + offer.category + "`, `" + offer.lifecycle_stage + "`)"), `${offer.id}: category/lifecycle drifted`);
}

for (const obsolete of ["- CareOps workflow review", "- Scoped implementation", "- Partnership and licensing qualification"]) {
  assert.ok(!llms.includes(obsolete), `obsolete llms.txt pathway remains: ${obsolete}`);
}

assert.ok(llms.includes(catalog.commercial_notice), "llms.txt commercial boundary must equal catalog commercial_notice");
assert.match(index, /recurring/i);
assert.match(readme, /recurring/i);
assert.match(support, /recurring/i);
assert.match(sitemap, /<lastmod>2026-10-19<\/lastmod>/);

console.log(`PASS: ${ids.length} recurring offers aligned across public catalog surfaces.`);
