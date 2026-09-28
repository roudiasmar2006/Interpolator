"""
Generates data.js from CoolProp.

CoolProp implements the IAPWS reference equations of state -- the same
formulations the printed textbook tables were computed from. So the numbers
are at least as accurate as the book, and they are ours to publish.

Run from the project root:  python tools/generate_tables.py
"""

import json
import math
from CoolProp.CoolProp import PropsSI
import CoolProp.CoolProp as CP



K = 273.15


# Textbook tables do not all use the same zero point. Water tables set u and s
# to zero for saturated liquid at the triple point, which is CoolProp's
# default. Refrigerant tables set h and s to zero at -40 C, the ASHRAE
# convention. Get this wrong and every enthalpy is off by a constant -- the
# numbers look plausible and are uniformly wrong.
REFERENCE = {
    "Water":         "DEF",
    "R134a":         "ASHRAE",
    "Ammonia":       "ASHRAE",
    "R22":           "ASHRAE",
    "Propane":       "ASHRAE",
    "CarbonDioxide": "ASHRAE",
}


def safe_range(fluid, step, floor=None, ceiling=None):
    """
    Temperature rows that stay inside the fluid's two-phase region.

    Below the triple point the fluid is solid; above the critical point there
    is no liquid/vapour distinction. Asking CoolProp outside that band raises,
    so the range is derived from the fluid rather than hardcoded per substance.
    """
    lo = PropsSI("Ttriple", fluid) - K
    hi = PropsSI("Tcrit", fluid) - K
    if floor is not None:
        lo = max(lo, floor)
    if ceiling is not None:
        hi = min(hi, ceiling)

    temps = []
    t = math.ceil(lo / step) * step
    while t < hi - 0.05:
        temps.append(round(t, 2))
        t += step
    return temps
COLUMNS = [
    {"key": "T",    "label": "T",    "unit": "\u00b0C",      "decimals": 2, "phase": "index"},
    {"key": "P",    "label": "P",    "unit": "kPa",          "decimals": 4, "phase": "index"},
    {"key": "v_f",  "label": "v_f",  "unit": "m\u00b3/kg",   "decimals": 6, "phase": "liquid"},
    {"key": "v_g",  "label": "v_g",  "unit": "m\u00b3/kg",   "decimals": 5, "phase": "vapor"},
    {"key": "u_f",  "label": "u_f",  "unit": "kJ/kg",        "decimals": 2, "phase": "liquid"},
    {"key": "u_fg", "label": "u_fg", "unit": "kJ/kg",        "decimals": 2, "phase": "evap"},
    {"key": "u_g",  "label": "u_g",  "unit": "kJ/kg",        "decimals": 2, "phase": "vapor"},
    {"key": "h_f",  "label": "h_f",  "unit": "kJ/kg",        "decimals": 2, "phase": "liquid"},
    {"key": "h_fg", "label": "h_fg", "unit": "kJ/kg",        "decimals": 2, "phase": "evap"},
    {"key": "h_g",  "label": "h_g",  "unit": "kJ/kg",        "decimals": 2, "phase": "vapor"},
    {"key": "s_f",  "label": "s_f",  "unit": "kJ/kg\u00b7K", "decimals": 4, "phase": "liquid"},
    {"key": "s_fg", "label": "s_fg", "unit": "kJ/kg\u00b7K", "decimals": 4, "phase": "evap"},
    {"key": "s_g",  "label": "s_g",  "unit": "kJ/kg\u00b7K", "decimals": 4, "phase": "vapor"},
]


def saturation_row(fluid, **known):
    """One saturation row. Q=0 is saturated liquid, Q=1 is saturated vapour."""

    def prop(name, q):
        return PropsSI(name, *sum(known.items(), ()), "Q", q, fluid)

    u_f, u_g = prop("U", 0) / 1000, prop("U", 1) / 1000
    h_f, h_g = prop("H", 0) / 1000, prop("H", 1) / 1000
    s_f, s_g = prop("S", 0) / 1000, prop("S", 1) / 1000

    return {
        "T":    round(prop("T", 0) - K, 2),
        "P":    round(prop("P", 0) / 1000, 4),
        "v_f":  round(1 / prop("D", 0), 6),
        "v_g":  round(1 / prop("D", 1), 5),
        "u_f":  round(u_f, 2),
        "u_fg": round(u_g - u_f, 2),
        "u_g":  round(u_g, 2),
        "h_f":  round(h_f, 2),
        "h_fg": round(h_g - h_f, 2),
        "h_g":  round(h_g, 2),
        "s_f":  round(s_f, 4),
        "s_fg": round(s_g - s_f, 4),
        "s_g":  round(s_g, 4),
    }


def build(table_id, name, fluid, index_column, values):
    rows = []
    for value in values:
        if index_column == "T":
            rows.append(saturation_row(fluid, T=value + K))
        else:
            rows.append(saturation_row(fluid, P=value * 1000))
    return {
        "id": table_id,
        "name": name,
        "substance": fluid,
        "source": "Generated from CoolProp (IAPWS reference equations of state)",
        "indexColumn": index_column,
        "columns": COLUMNS,
        "rows": rows,
    }


WATER_TEMPS = [0.01] + list(range(5, 100, 5)) + list(range(100, 375, 5))


def main():
    tables = []

    for fluid, name, floor, step in [
        ("Water",         "Saturated water",         None, 5),
        ("R134a",         "Saturated R-134a",        -40,  5),
        ("Ammonia",       "Saturated ammonia",       -40,  5),
        ("R22",           "Saturated R-22",          -60,  5),
        ("Propane",       "Saturated propane",       -40,  5),
        ("CarbonDioxide", "Saturated carbon dioxide", -50, 5),
    ]:
        CP.set_reference_state(fluid, REFERENCE[fluid])

        temps = safe_range(fluid, step, floor=floor)
        if fluid == "Water":
            temps = [0.01] + temps

        table_id = fluid.lower().replace("-", "") + "_sat_temp"
        tables.append(build(table_id, f"{name} \u2014 temperature index",
                            fluid, "T", temps))

        CP.set_reference_state(fluid, "DEF")

    with open("data.js", "w", encoding="utf-8") as f:
        f.write("// Generated by tools/generate_tables.py -- do not edit by hand.\n")
        f.write("window.THERMO_TABLES = ")
        f.write(json.dumps(tables, indent=2, ensure_ascii=False))
        f.write(";\n")

    for t in tables:
        first, last = t["rows"][0], t["rows"][-1]
        print(f"{t['id']:<22} {len(t['rows']):>3} rows   "
              f"{first['T']:>7} to {last['T']:>7} C   "
              f"h_f at first row = {first['h_f']:>8}")


if __name__ == "__main__":
    main()