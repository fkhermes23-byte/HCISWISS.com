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

const expectedPublicOffers = catalog.offers.map(({ id, name, category, lifecycle_stage }) => ({
  id,
  name,
  category,
  lifecycle: lifecycle_stage,
}));

function parseAtxHeading(line) {
  const match = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/);
  if (!match) return null;
  return {
    level: match[1].length,
    text: (match[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "").trim().replace(/[ \t]+/g, " "),
  };
}

function parseCanonicalOfferSection(source) {
  const sourceLines = source.split(/\r\n|\n|\r/);
  const isCanonicalHeading = (line) => {
    const heading = parseAtxHeading(line);
    return heading?.level === 2 && heading.text === "Canonical recurring offers";
  };
  assert.equal(
    sourceLines.filter(isCanonicalHeading).length,
    1,
    "llms.txt must contain exactly one canonical recurring offers section",
  );
  const start = sourceLines.findIndex(isCanonicalHeading);
  const end = sourceLines.findIndex((line, index) => {
    const heading = parseAtxHeading(line);
    return index > start && heading !== null && heading.level <= 2;
  });
  assert.notEqual(end, -1, "canonical recurring offers section must end at the next heading");
  const offerLines = sourceLines.slice(start + 1, end).map((line) => line.trim()).filter(Boolean);
  return offerLines.map((line) => {
    const match = line.match(
      /^- `([^`]+)` — (.+) \(`([^`]+)`, `([^`]+)`\)$/,
    );
    assert.ok(match, `invalid or unknown canonical offer line: ${line}`);
    return {
      id: match[1],
      name: match[2],
      category: match[3],
      lifecycle: match[4],
    };
  });
}

function assertCanonicalOfferSection(source) {
  assert.deepEqual(
    parseCanonicalOfferSection(source),
    expectedPublicOffers,
    "llms.txt canonical offers must exactly equal catalog.json in count, set, values and order",
  );
}

assert.equal(expectedPublicOffers.length, 4, "the reviewed recurring-only catalog must contain exactly four offers");
assertCanonicalOfferSection(llms);

for (const offer of catalog.offers) {
  assert.equal(offer.recurring, true, `${offer.id}: recurring must be true`);
  assert.equal(offer.one_time_checkout, false, `${offer.id}: one-time checkout must be false`);
  assert.equal(offer.status, "qualification_required", `${offer.id}: qualification must be required`);
  assert.equal(offer.mandate_required, true, `${offer.id}: mandate must be required`);
  assert.equal(offer.cancellation_path_required, true, `${offer.id}: cancellation path must be required`);
  assert.equal(offer.material_change_reacceptance_required, true, `${offer.id}: material changes must require reacceptance`);
  assert.deepEqual(offer.supported_billing_periods, ["month", "year"], `${offer.id}: billing periods drifted`);
}

const nextHeading = "## Shared recurring terms";
const insertBeforeNextHeading = (text) => llms.replace(nextHeading, text + nextHeading);
const canonicalLines = expectedPublicOffers.map(
  ({ id, name, category, lifecycle }) => `- \`${id}\` — ${name} (\`${category}\`, \`${lifecycle}\`)`,
);

assert.throws(
  () => assertCanonicalOfferSection(insertBeforeNextHeading(canonicalLines[0] + "\n\n")),
  /exactly equal|invalid or unknown/,
  "duplicate offer lines must fail",
);
assert.throws(
  () => assertCanonicalOfferSection(insertBeforeNextHeading("- `unknown-offer` — Unknown (`recurring_service`, `pre_deal`)\n\n")),
  /exactly equal/,
  "unknown extra offers must fail",
);
assert.throws(
  () => assertCanonicalOfferSection(llms.replace("careops-readiness-retainer", "unknown-id")),
  /exactly equal/,
  "unknown replacement IDs must fail",
);
assert.throws(
  () => assertCanonicalOfferSection(
    llms.replace(canonicalLines.join("\n"), [...canonicalLines].reverse().join("\n")),
  ),
  /exactly equal/,
  "catalog order drift must fail",
);

// A later duplicate section must not escape validation after the first match.
// Equivalent ATX headings must participate in both uniqueness and boundaries.
for (const heading of [
  "## Canonical recurring offers ##",
  "##  Canonical recurring offers",
  "  ## Canonical recurring offers",
  "##\tCanonical recurring offers\t###",
]) {
  assertCanonicalOfferSection(llms.replace("## Canonical recurring offers", heading));
  for (const source of [
    `${llms}\n${heading}\n\n- \u0060unapproved-once\u0060 — Once (\u0060one_time\u0060, \u0060post_deal\u0060)\n\n## End\n`,
    `${heading}\n\n${canonicalLines.join("\n")}\n\n${llms}`,
  ]) {
    assert.throws(
      () => assertCanonicalOfferSection(source),
      /exactly one canonical recurring offers section/,
      "equivalent duplicate canonical headings must fail",
    );
  }
}
assertCanonicalOfferSection(llms.replaceAll("\n", "\r\n"));

assert.throws(
  () => assertCanonicalOfferSection(
    `${llms}\n## Canonical recurring offers\n\n- \`unapproved-once\` — Once (\`one_time\`, \`post_deal\`)\n\n## End\n`,
  ),
  /exactly one canonical recurring offers section/,
  "a second canonical section with an unapproved offer must fail",
);
assert.throws(
  () => assertCanonicalOfferSection(
    `## Canonical recurring offers\n\n${canonicalLines.join("\n")}\n\n${llms}`,
  ),
  /exactly one canonical recurring offers section/,
  "a preceding duplicate canonical section must fail even when its offers match",
);
assert.throws(
  () => assertCanonicalOfferSection(llms.replace("## Canonical recurring offers", "## Retired heading")),
  /exactly one canonical recurring offers section/,
  "missing canonical section must fail",
);

for (const obsolete of ["- CareOps workflow review", "- Scoped implementation", "- Partnership and licensing qualification"]) {
  assert.ok(!llms.includes(obsolete), `obsolete llms.txt pathway remains: ${obsolete}`);
}

assert.ok(llms.includes(catalog.commercial_notice), "llms.txt commercial boundary must equal catalog commercial_notice");
assert.match(index, /recurring/i);
assert.match(readme, /recurring/i);
assert.match(support, /recurring/i);
assert.match(sitemap, /<lastmod>2026-10-18<\/lastmod>/);

console.log(`PASS: ${ids.length} recurring offers aligned across public catalog surfaces.`);
