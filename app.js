/* =========================================================================
   PART 1 -- THE ENGINE
   Pure functions only. No DOM access, no globals.
   Everything here is testable under Node and could move to a server unchanged.
   ====================================================================== */

/** Thrown when a requested value falls outside a table. Never extrapolate. */
class OutOfRangeError extends Error {
  constructor(value, min, max, unit) {
    super(
      `${value} ${unit} is outside this table (${min} to ${max} ${unit}). ` +
      `Extrapolating past the ends of a table gives a meaningless number, ` +
      `so it is refused.`
    );
    this.name = 'OutOfRangeError';
  }
}

/**
 * Linear interpolation.
 *   y = (y2 - y1) / (x2 - x1) * (x - x1) + y1
 */
function lerp(x1, y1, x2, y2, x) {
  if (x2 === x1) return y1;
  return ((y2 - y1) / (x2 - x1)) * (x - x1) + y1;
}

/** Look up a column's declared unit. */
function unitOf(table, key) {
  const col = table.columns.find(c => c.key === key);
  return col ? col.unit : '';
}

/**
 * The two adjacent rows surrounding x, found by binary search.
 * Throws OutOfRangeError if x is beyond either end of the table.
 */
function findBracket(table, x) {
  const rows = table.rows;
  const key = table.indexColumn;

  if (rows.length < 2) {
    throw new Error(`Table "${table.id}" needs at least two rows.`);
  }

  const min = rows[0][key];
  const max = rows[rows.length - 1][key];

  if (x < min || x > max) {
    throw new OutOfRangeError(x, min, max, unitOf(table, key));
  }

  let lo = 0;
  let hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rows[mid][key] <= x) lo = mid;
    else hi = mid;
  }
  return [rows[lo], rows[hi], lo, hi];
}

/**
 * Interpolate every column of the table at index value x.
 * Returns the values plus both source rows, so the UI can show the working.
 */
function interpolate(table, x) {
  const key = table.indexColumn;
  const [lower, upper, loIdx, hiIdx] = findBracket(table, x);

  // An exact hit is returned verbatim -- no arithmetic, no floating-point dust.
  if (lower[key] === x) {
    return { values: { ...lower }, lower, upper: lower, exact: true,
             fraction: 0, loIdx, hiIdx: loIdx };
  }
  if (upper[key] === x) {
    return { values: { ...upper }, lower: upper, upper, exact: true,
             fraction: 1, loIdx: hiIdx, hiIdx };
  }

  const values = {};
  for (const col of table.columns) {
    values[col.key] = lerp(
      lower[key], lower[col.key],
      upper[key], upper[col.key],
      x
    );
  }

  const fraction = (x - lower[key]) / (upper[key] - lower[key]);
  return { values, lower, upper, exact: false, fraction, loIdx, hiIdx };
}

/** Quality x in the two-phase region:  x = (y - y_f) / y_fg */
function quality(yF, yFg, y) {
  if (yFg === 0) throw new Error('y_fg is zero, so this is not a two-phase state.');
  return (y - yF) / yFg;
}

/** Any property at a known quality:  y = y_f + x * y_fg */
function atQuality(yF, yFg, x) {
  return yF + x * yFg;
}
/* =========================================================================
   PART 2 -- FORMATTING
   ====================================================================== */

const columnOf = (table, key) => table.columns.find(c => c.key === key);

/** Round for display using the precision declared in the table schema. */
function fmt(table, key, value) {
  const col = columnOf(table, key);
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  const d = col ? col.decimals : 4;
  if (value !== 0 && (Math.abs(value) >= 1e5 || Math.abs(value) < 1e-4)) {
    return value.toExponential(3);
  }
  return value.toFixed(d);
}

/**
 * Renders "v_f" as v with a real subscript f.
 * Unicode has subscript e and 9 but NO subscript f or g, so markup is the only
 * correct route. Lookalike characters would render v_f as a visibly wrong "vₑ".
 */
function labelNode(label) {
  const frag = document.createDocumentFragment();
  const [base, sub] = label.split('_');
  frag.append(document.createTextNode(base));
  if (sub) {
    const s = document.createElement('sub');
    s.textContent = sub;
    frag.append(s);
  }
  return frag;
}

/* =========================================================================
   PART 3 -- THE UI
   ====================================================================== */

const el = id => document.getElementById(id);

const state = {
  tables: window.THERMO_TABLES || [],
  table: null,
  raw: '',
  result: null,
  error: null,
};

function init() {
  if (!state.tables.length) {
    el('error').textContent = 'No property tables loaded. Run tools/generate_tables.py.';
    el('error').hidden = false;
    return;
  }

  const select = el('table-select');
  for (const t of state.tables) {
    const option = document.createElement('option');
    option.value = t.id;
    option.textContent = t.name;
    select.append(option);
  }

  select.addEventListener('change', () => {
    state.table = state.tables.find(t => t.id === select.value);
    recalculate();
  });

  el('value-input').addEventListener('input', e => {
    state.raw = e.target.value;
    recalculate();
  });

  state.table = state.tables[0];
  recalculate();
}

function recalculate() {
  const table = state.table;
  const key = table.indexColumn;

  el('input-label').textContent = key === 'T' ? 'Temperature' : 'Pressure';
  el('input-unit').textContent = unitOf(table, key);

  // Accept a comma as a decimal separator -- German keyboards produce it.
  const text = state.raw.trim().replace(',', '.');
  const x = text === '' ? NaN : Number(text);

  if (!Number.isFinite(x)) {
    state.result = null;
    state.error = text === '' ? null : `"${state.raw.trim()}" is not a number.`;
  } else {
    try {
      state.result = interpolate(table, x);
      state.error = null;
    } catch (err) {
      state.result = null;
      state.error = err.message;
    }
  }

  render();
}

function render() {
  const { table, result, error } = state;

  el('hint').hidden = Boolean(result || error);
  el('error').hidden = !error;
  if (error) el('error').textContent = error;

  el('readout').hidden = !result;
  el('table-wrap').hidden = !result;
  el('working').hidden = !result || result.exact;

  if (!result) return;

  renderReadout(table, result);
  renderTable(table, result);
  if (!result.exact) renderWorking(table, result);
}

function renderReadout(table, result) {
  const key = table.indexColumn;

  el('readout-state').textContent =
    `${table.substance} · ${fmt(table, key, result.values[key])} ${unitOf(table, key)}`;

  el('readout-note').textContent = result.exact
    ? 'exact table row — no interpolation needed'
    : `interpolated ${(result.fraction * 100).toFixed(0)}% between ` +
      `${fmt(table, key, result.lower[key])} and ${fmt(table, key, result.upper[key])}`;

  const grid = el('readout-grid');
  grid.replaceChildren();

  for (const col of table.columns) {
    if (col.key === key) continue;

    const wrap = document.createElement('div');

    const dt = document.createElement('dt');
    dt.append(labelNode(col.label));

    const dd = document.createElement('dd');
    dd.className = `phase-${col.phase}`;
    dd.textContent = fmt(table, col.key, result.values[col.key]);

    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = col.unit;
    dd.append(unit);

    wrap.append(dt, dd);
    grid.append(wrap);
  }
}

/** Draws a window of table rows with the interpolated row inserted in place. */
function renderTable(table, result) {
  const WINDOW = 4;

  const thead = el('thead');
  thead.replaceChildren();
  const headRow = document.createElement('tr');
  for (const col of table.columns) {
    const th = document.createElement('th');
    th.className = `phase-${col.phase}`;
    th.append(labelNode(col.label));
    const unit = document.createElement('span');
    unit.className = 'th-unit';
    unit.textContent = col.unit;
    th.append(unit);
    headRow.append(th);
  }
  thead.append(headRow);

  const start = Math.max(0, result.loIdx - WINDOW);
  const end = Math.min(table.rows.length - 1, result.hiIdx + WINDOW);

  const tbody = el('tbody');
  tbody.replaceChildren();

  for (let i = start; i <= end; i++) {
    const isLower = !result.exact && i === result.loIdx;
    const isUpper = !result.exact && i === result.hiIdx;

    tbody.append(buildRow(table, table.rows[i],
      isLower ? 'source source--lower' : isUpper ? 'source source--upper' : ''));

    // The interpolated row goes directly beneath its lower bracket.
    if (isLower) tbody.append(buildRow(table, result.values, 'result'));
  }
}

function buildRow(table, values, className) {
  const tr = document.createElement('tr');
  if (className) tr.className = className;
  for (const col of table.columns) {
    const td = document.createElement('td');
    td.textContent = fmt(table, col.key, values[col.key]);
    tr.append(td);
  }
  return tr;
}

/** Shows the formula with the actual numbers substituted, for every property. */
function renderWorking(table, result) {
  const key = table.indexColumn;
  const x  = result.values[key];
  const x1 = result.lower[key];
  const x2 = result.upper[key];
  const u  = unitOf(table, key);

  el('working-intro').textContent =
    `${fmt(table, key, x)} ${u} falls between the ${fmt(table, key, x1)} ${u} and ` +
    `${fmt(table, key, x2)} ${u} rows, so every property is interpolated linearly ` +
    `between them. Each line below is the same formula with different numbers.`;

  const steps = el('working-steps');
  steps.replaceChildren();

  for (const col of table.columns) {
    if (col.key === key) continue;

    const y1 = result.lower[col.key];
    const y2 = result.upper[col.key];

    const div = document.createElement('div');
    div.className = 'step';

    const name = document.createElement('b');
    name.className = `phase-${col.phase}`;
    name.append(labelNode(col.label));

    const body = document.createTextNode(
      ` = (${fmt(table, col.key, y2)} − ${fmt(table, col.key, y1)})` +
      ` ÷ (${fmt(table, key, x2)} − ${fmt(table, key, x1)})` +
      ` × (${fmt(table, key, x)} − ${fmt(table, key, x1)})` +
      ` + ${fmt(table, col.key, y1)} = `
    );

    const out = document.createElement('span');
    out.className = 'out';
    out.textContent = `${fmt(table, col.key, result.values[col.key])} ${col.unit}`;

    div.append(name, body, out);
    steps.append(div);
  }
}

document.addEventListener('DOMContentLoaded', init);