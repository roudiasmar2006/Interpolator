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