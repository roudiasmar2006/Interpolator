/**
 * Engine tests.  Run with:  node test.js
 *
 * These load app.js and evaluate only the engine section, which is why that
 * part must stay free of DOM access. If a test starts failing with
 * "document is not defined", something UI-shaped has leaked into the engine.
 */

const fs = require('fs');
const path = require('path');

global.window = {};
require(path.join(__dirname, 'data.js'));

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')
  .split(/\/\* =+\s*\n\s*PART 2 -- FORMATTING/)[0];
// Node 24 keeps eval'd declarations inside the eval's own scope, so the
// engine's functions are re-exported explicitly rather than relying on leakage.
// new Function runs the engine in its own scope and hands back the symbols.
// More predictable than eval, whose scoping rules changed in Node 24.
const engine = new Function(
  source + `
  return { lerp, unitOf, findBracket, interpolate, quality, atQuality, OutOfRangeError };
`)();

const { lerp, unitOf, findBracket, interpolate, quality, atQuality, OutOfRangeError } = engine;

const TABLES = global.window.THERMO_TABLES;
const water = TABLES.find(t => t.id === 'water_sat_temp');

let passed = 0;
let failed = 0;

function ok(name, condition) {
  if (condition) { passed++; console.log(`  pass  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); }
}

function near(name, actual, expected, tolerance) {
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
    console.log(`  pass  ${name}  (${actual.toFixed(4)})`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}  got ${actual}, expected ${expected} +/- ${tolerance}`);
  }
}

function throws(name, fn) {
  try {
    fn();
    failed++;
    console.log(`  FAIL  ${name}  (did not throw)`);
  } catch (e) {
    passed++;
    console.log(`  pass  ${name}`);
  }
}

// ------------------------------------------------------------- the formula

console.log('\nlerp');
near('midpoint of 0..100', lerp(0, 0, 10, 100, 5), 50, 1e-12);
near('returns y1 at x1', lerp(2, 7, 8, 19, 2), 7, 1e-12);
near('returns y2 at x2', lerp(2, 7, 8, 19, 8), 19, 1e-12);
near('handles a falling series', lerp(0, 100, 10, 0, 2.5), 75, 1e-12);

// -------------------------------------------------------------- bracketing

console.log('\nfindBracket');
throws('refuses a value below the table', () => findBracket(water, -50));
throws('refuses a value above the table', () => findBracket(water, 9999));

const [lo, hi] = findBracket(water, 36.2);
ok('brackets 36.2 between 35 and 40', lo.T === 35 && hi.T === 40);

// ------------------------------------------------------------- interpolate

console.log('\ninterpolate');
const exact = interpolate(water, 35);
ok('exact row is flagged', exact.exact === true);
ok('exact row is returned verbatim',
   exact.values.u_f === water.rows.find(r => r.T === 35).u_f);

const r = interpolate(water, 36.2);
ok('non-exact value is flagged', r.exact === false);
near('interpolation fraction', r.fraction, 0.24, 1e-9);

// Hand calculation, done independently of the engine.
const row35 = water.rows.find(x => x.T === 35);
const row40 = water.rows.find(x => x.T === 40);
const handUf = (36.2 - 35) / (40 - 35) * (row40.u_f - row35.u_f) + row35.u_f;
near('u_f at 36.2 C matches the hand calculation', r.values.u_f, handUf, 1e-9);

ok('every column was interpolated',
   water.columns.every(c => Number.isFinite(r.values[c.key])));

// ------------------------------------------------- against your textbook

console.log('\nagainst Borgnakke Table B.1.1');
near('u_f at the triple point is the zero reference',
     interpolate(water, 0.01).values.u_f, 0, 0.01);
near('u_f at 40 C', interpolate(water, 40).values.u_f, 167.53, 0.05);
near('v_g at 35 C', interpolate(water, 35).values.v_g, 25.2148, 0.02);

const r134a = TABLES.find(t => t.id === 'r134a_sat_temp');
near('R-134a uses the -40 C zero reference for h',
     interpolate(r134a, -40).values.h_f, 0, 0.01);
near('R-134a uses the -40 C zero reference for s',
     interpolate(r134a, -40).values.s_f, 0, 0.0001);

// ----------------------------------------------------------------- quality

console.log('\nquality');
near('x = 0 at saturated liquid', quality(100, 2000, 100), 0, 1e-12);
near('x = 1 at saturated vapour', quality(100, 2000, 2100), 1, 1e-12);
near('x = 0.5 halfway across', quality(100, 2000, 1100), 0.5, 1e-12);
near('atQuality inverts quality', atQuality(100, 2000, 0.35), 800, 1e-9);

// --------------------------------------------------------------- integrity

console.log('\nschema integrity');
for (const t of TABLES) {
  const key = t.indexColumn;
  const keys = t.columns.map(c => c.key);

  ok(`${t.id}: index is strictly increasing`,
     t.rows.every((row, i) => i === 0 || row[key] > t.rows[i - 1][key]));

  ok(`${t.id}: every row has every column`,
     t.rows.every(row => keys.every(k => Number.isFinite(row[k]))));

  ok(`${t.id}: u_fg equals u_g minus u_f`,
     t.rows.every(row => Math.abs(row.u_fg - (row.u_g - row.u_f)) < 0.02));

  ok(`${t.id}: h_fg equals h_g minus h_f`,
     t.rows.every(row => Math.abs(row.h_fg - (row.h_g - row.h_f)) < 0.02));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);