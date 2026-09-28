# Interpolator

A thermodynamic property calculator. Pick a substance, enter a temperature, and
it finds the surrounding table rows, interpolates, and shows the working.


Built for my Thermodynamics course, where every problem starts with the same
tedious step: find two rows in a printed table, copy out eight numbers, apply
the same formula to each one by hand.


Tables carry their own column definitions, so adding a substance is a data
change. The UI was written against one table and needed no edits for six.

## Contributors

- **Roudi Al Asmar** — engine, interface, data pipeline, deployment
- **Laya Masri** — thermodynamics domain modelling, table specification,
  verification against textbook values, styling

## Licence

MIT.

## What it does

- Six substances: water, R-134a, ammonia, R-22, propane, carbon dioxide
- Saturation tables, temperature-indexed
- Interpolates every property at once, not one at a time
- Prints the substituted formula for each, so you can copy the working onto a
  homework sheet
- Refuses values outside a table's range instead of extrapolating

## What it doesn't do yet

- Superheated tables (would need a second index dimension)
- Compressed liquid
- Quality (x) calculations — the functions are written and tested, not wired up
- Unit conversion; everything is SI

## Run it

Open `index.html`. No build step, no dependencies.

## The data

Generated with [CoolProp](http://www.coolprop.org/), which implements the same
IAPWS equations of state the printed tables were computed from. Values agree
with Borgnakke Table B.1.1 to about 0.05% — the difference is the book using an
older formulation.

Reference states are set per substance. Water tables zero u and s at the triple
point; refrigerant tables zero h and s at −40 °C. CoolProp defaults to a third
convention for refrigerants, so getting this wrong shifts every enthalpy by a
constant without anything looking broken. There's a test for it.

```bash
pip install CoolProp
python tools/generate_tables.py
```

## Tests

```bash
node test.js
```

Checks the formula, out-of-range handling, an interpolation against a hand
calculation, textbook values, reference states, and that the generated data is
internally consistent.


