#!/usr/bin/env python3
"""Generate the reference pages that must never be hand-written.

Two outputs:
    docs/dev/api/endpoints.md    every HTTP operation, from FastAPI's own schema
    docs/reference/catalog.md    every object/material type, property and unit,
                                 from the seeded SQLite database

Both are regenerated, never edited. Run from the repository root:

    helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py

The API dump imports `app.main`, which loads PyHelios. That is fast when the
native library is current; if the C++ sources are NEWER than the built library,
the import triggers a CMake rebuild that can take 30 minutes. Checked and
refused below rather than left as a surprise.
"""
from __future__ import annotations

import os
import sqlite3
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "helios-desktop-backend"
API_OUT = REPO / "docs" / "dev" / "api" / "endpoints.md"
CATALOG_OUT = REPO / "docs" / "reference" / "catalog.md"

# Router prefixes the renderer never calls — see docs/reference/dormant.md.
DORMANT_PREFIXES = (
    "/api/objects", "/api/tree", "/api/plantarch",
    "/api/timeseries", "/api/script", "/api/data-units",
    "/api/import",
)

BANNER = (
    "<!-- GENERATED FILE — do not edit by hand.\n"
    "     Regenerate: helios-desktop-backend/venv/bin/python3 "
    "docs/gen/generate_reference.py -->\n\n"
)

METHODS = ("get", "post", "put", "patch", "delete")


# ── Shared helpers ───────────────────────────────────────────────────────────


def cell(text: object) -> str:
    """Escape a value for a Markdown table cell."""
    s = "" if text is None else str(text)
    return s.replace("|", "\\|").replace("\n", " ").strip()


def stamp() -> str:
    return f"*Generated {date.today().isoformat()}.*\n\n"


# ── 1. HTTP endpoints ────────────────────────────────────────────────────────


def _assert_pyhelios_fresh() -> None:
    """Refuse to run when importing would kick off a native rebuild."""
    src = BACKEND / "pyhelios"
    libs = ["libhelios.dylib", "libhelios.so", "libhelios.dll"]
    built = [p for p in (src / "pyhelios_build/build/lib" / n for n in libs) if p.exists()]
    if not built:
        sys.exit(
            "PyHelios native library not found. Importing app.main would trigger a "
            "CMake build (10-30 min).\nBuild it first:\n"
            "  cd helios-desktop-backend && source venv/bin/activate && "
            "bash scripts/build_pyhelios.sh"
        )
    lib_mtime = max(p.stat().st_mtime for p in built)
    newest = 0.0
    for d in (src / "helios-core", src / "native"):
        if not d.exists():
            continue
        for pattern in ("*.[ch]pp", "*.h"):
            for f in d.rglob(pattern):
                newest = max(newest, f.stat().st_mtime)
    if newest > lib_mtime:
        sys.exit(
            "PyHelios sources are newer than the built library, so importing app.main "
            "would trigger a CMake rebuild (10-30 min).\nRebuild deliberately first:\n"
            "  cd helios-desktop-backend && source venv/bin/activate && "
            "bash scripts/build_pyhelios.sh"
        )


def generate_api() -> int:
    _assert_pyhelios_fresh()
    sys.path.insert(0, str(BACKEND))
    # chdir FIRST. The backend's pydantic Settings reads `.env` from the CURRENT
    # WORKING DIRECTORY and forbids unknown keys — so importing app.main from the
    # repository root picks up the FRONTEND's .env (VITE_BACKEND_URL,
    # VITE_GEOMETRY_FORMAT) and dies with `extra_forbidden` before any route is
    # registered. All output paths here are absolute, so the chdir is free.
    os.chdir(BACKEND)
    from app.main import app  # noqa: E402  — after the freshness gate and the chdir

    schema = app.openapi()
    paths: dict = schema["paths"]

    by_tag: dict[str, list[tuple[str, str, str]]] = {}
    total = 0
    for path, ops in sorted(paths.items()):
        for method, op in ops.items():
            if method not in METHODS:
                continue
            total += 1
            tag = (op.get("tags") or ["untagged"])[0]
            summary = op.get("summary") or ""
            doc = (op.get("description") or "").strip().splitlines()
            if not summary and doc:
                summary = doc[0]
            by_tag.setdefault(tag, []).append((method.upper(), path, summary))

    out = [BANNER, "# HTTP endpoints\n\n", stamp()]
    out.append(
        f"**{total} operations** across **{len(paths)} paths**, from the FastAPI application's "
        "own OpenAPI schema.\n\n"
    )
    out.append(
        '!!! tip "The live schema is always available"\n'
        "    While the backend is running: **`/docs`** (Swagger UI) and **`/openapi.json`**.\n\n"
    )
    out.append(
        '!!! warning "Not every endpoint is reachable from the UI"\n'
        "    Rows marked :material-sleep: are on a router the renderer never calls. See\n"
        "    [Dormant surface](../../reference/dormant.md).\n\n"
    )
    out.append("See [Backend API](http.md) for the conventions these all follow.\n\n")

    for tag in sorted(by_tag):
        rows = sorted(by_tag[tag], key=lambda r: (r[1], r[0]))
        out.append(f"## `{tag}`\n\n")
        out.append("| | Method | Path | Summary |\n|---|---|---|---|\n")
        for method, path, summary in rows:
            dormant = ":material-sleep:" if path.startswith(DORMANT_PREFIXES) else ""
            out.append(f"| {dormant} | `{method}` | `{cell(path)}` | {cell(summary)} |\n")
        out.append("\n")

    API_OUT.parent.mkdir(parents=True, exist_ok=True)
    API_OUT.write_text("".join(out), encoding="utf-8")
    return total


# ── 2. The seeded catalog ────────────────────────────────────────────────────


def _db_path() -> Path:
    import platform

    home = Path.home()
    system = platform.system()
    if system == "Darwin":
        base = home / "Library/Application Support/Helios"
    elif system == "Windows":
        base = home / "AppData/Roaming/Helios"
    else:
        base = home / ".config/Helios"
    for candidate in (base / "backend-data/heliosgui.db", BACKEND / "helios.db"):
        if candidate.exists():
            return candidate
    sys.exit(
        "No Helios database found. Run the app once so migrations create it, or pass a path."
    )


def generate_catalog(db_path: Path) -> int:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    q = lambda sql, *a: con.execute(sql, a).fetchall()  # noqa: E731

    out = [BANNER, "# Catalog reference\n\n", stamp()]
    out.append(
        "Every object type, material type, property and unit currently seeded by the "
        "migrations.\n\n"
        "The forms in the app are **built from this data**, so this reference is generated "
        "from it rather than written by hand. Changing anything here means writing a "
        "migration — see [The property system](../dev/arch/properties.md).\n\n"
    )
    out.append(f"Source: `{db_path.name}`, schema version "
               f"**{q('SELECT MAX(version) v FROM schema_migrations')[0]['v']}**.\n\n")

    # Datatypes
    names = [r["name"] for r in q("SELECT name FROM datatype ORDER BY id")]
    out.append("## Datatypes\n\n" + ", ".join(f"`{n}`" for n in names) + "\n\n")
    out.append("Canonical storage forms are documented in "
               "[The property system](../dev/arch/properties.md#canonical-storage-forms).\n\n")

    rows_written = 0

    # Object types
    out.append("## Object types\n\n")
    for ot in q("SELECT id, object FROM object_types ORDER BY object"):
        props = q(
            """SELECT pt.property, d.name dt,
                      COALESCE(l.min_override, pt.min) mn,
                      COALESCE(l.max_override, pt.max) mx,
                      pt.description, l.display_order ord
               FROM object_property_type l
               JOIN property_type pt ON pt.id = l.property_type_id
               JOIN datatype d ON d.id = pt.datatype_id
               WHERE l.object_type_id = ?
               ORDER BY l.display_order""",
            ot["id"],
        )
        out.append(f"### {ot['object']}\n\n")
        if not props:
            out.append("_No properties linked yet._\n\n")
            continue
        out.append("| # | Property | Type | Min | Max | Description |\n|---|---|---|---|---|---|\n")
        for p in props:
            rows_written += 1
            out.append(
                f"| {p['ord']} | `{p['property']}` | `{p['dt']}` | {cell(p['mn'])} | "
                f"{cell(p['mx'])} | {cell(p['description'])} |\n"
            )
        out.append("\n")

    # Material types
    out.append("## Material types\n\n")
    has_meta = {r["name"] for r in q("PRAGMA table_info(material_property_type)")}
    grp = "l.group_name" if "group_name" in has_meta else "NULL"
    vis = "l.visibility" if "visibility" in has_meta else "NULL"
    lbl = "l.label" if "label" in has_meta else "NULL"
    sel = "l.selector_property" if "selector_property" in has_meta else "NULL"
    selv = "l.selector_value" if "selector_value" in has_meta else "NULL"

    for mt in q("SELECT id, materialtype, description FROM material_type ORDER BY materialtype"):
        props = q(
            f"""SELECT pt.property, d.name dt,
                       COALESCE(l.min_override, pt.min) mn,
                       COALESCE(l.max_override, pt.max) mx,
                       pt.enum_values, l.display_order ord,
                       {grp} grp, {vis} vis, {lbl} lbl, {sel} sel, {selv} selv
                FROM material_property_type l
                JOIN property_type pt ON pt.id = l.property_type_id
                JOIN datatype d ON d.id = pt.datatype_id
                WHERE l.material_type_id = ?
                ORDER BY l.display_order""",
            mt["id"],
        )
        out.append(f"### {mt['materialtype']}\n\n")
        if mt["description"]:
            out.append(f"{mt['description']}\n\n")
        if not props:
            out.append("_No properties linked yet._\n\n")
            continue
        out.append(
            "| # | Property | Type | Min | Max | Group | Visibility |\n"
            "|---|---|---|---|---|---|---|\n"
        )
        for p in props:
            rows_written += 1
            group = p["grp"] or ""
            if p["sel"]:
                group += f" _(when `{p['sel']}` = `{p['selv']}`)_"
            enum = f" `{p['enum_values']}`" if p["enum_values"] else ""
            out.append(
                f"| {p['ord']} | `{p['property']}`{enum} | `{p['dt']}` | {cell(p['mn'])} | "
                f"{cell(p['mx'])} | {cell(group)} | {cell(p['vis'])} |\n"
            )
        out.append("\n")

    out.append(
        '!!! note "Visibility"\n'
        "    The catalog endpoint returns only `editable` rows. `external` values are set "
        "elsewhere (the Weather panel, the project header); `computed` are produced by another "
        "model; `superseded` were replaced by newer properties. **Validation and apply keep every "
        "property regardless.**\n\n"
    )

    # Weather catalog
    out.append("## Weather data types & units\n\n")
    out.append(
        "A **separate** catalog from the property system above — this one carries units and "
        "conversions. `value_in_base = value x to_base_factor + to_base_offset`.\n\n"
    )
    for dt in q("SELECT id, data_type, description FROM helios_data_types ORDER BY data_type"):
        units = q(
            """SELECT unit, alias, is_base, to_base_factor, to_base_offset, min, max
               FROM data_units WHERE data_type_id = ? ORDER BY is_base DESC, unit""",
            dt["id"],
        )
        if not units:
            continue
        out.append(f"### {dt['data_type']}\n\n")
        out.append("| Unit | Base | Factor | Offset | Min | Max |\n|---|---|---|---|---|---|\n")
        for u in units:
            rows_written += 1
            base = "**base**" if u["is_base"] else ""
            out.append(
                f"| `{u['unit']}` | {base} | {cell(u['to_base_factor'])} | "
                f"{cell(u['to_base_offset'])} | {cell(u['min'])} | {cell(u['max'])} |\n"
            )
        out.append("\n")

    out.append("## Related\n\n"
               "- [The property system](../dev/arch/properties.md) — the mechanism.\n"
               "- [Add a property to a type](../dev/recipes/add-property.md) — changing any of "
               "this.\n")

    CATALOG_OUT.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_OUT.write_text("".join(out), encoding="utf-8")
    con.close()
    return rows_written


if __name__ == "__main__":
    ops = generate_api()
    print(f"[docs] {API_OUT.relative_to(REPO)} — {ops} operations")
    db = Path(sys.argv[1]) if len(sys.argv) > 1 else _db_path()
    rows = generate_catalog(db)
    print(f"[docs] {CATALOG_OUT.relative_to(REPO)} — {rows} rows from {db}")
