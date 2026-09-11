
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

import json
import os
import re
import sqlite3
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "helios-desktop-backend"
API_OUT = REPO / "docs" / "dev" / "api" / "endpoints.md"
OPS_DIR = REPO / "docs" / "dev" / "api" / "ops"
CATALOG_OUT = REPO / "docs" / "reference" / "catalog.md"

# Router prefixes the renderer never calls. Operations on these are left OUT of
# the generated reference entirely — documenting a route the UI cannot reach
# invites work on it. They are recorded in docs/reference/dormant.md instead,
# and remain visible in the live `/docs` schema.
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


def _ref_name(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def _anchor(name: str) -> str:
    """The heading anchor MkDocs generates for a `### \\`Name\\`` heading."""
    return name.lower()


def _op_anchor(method: str, path: str) -> str:
    """An EXPLICIT anchor id for an operation heading.

    Emitted with attr_list (`{#id}`) rather than relying on the theme's slugify:
    these headings contain backticks, slashes and `{braces}`, and guessing how
    each is stripped is exactly the kind of silent broken link nobody notices.
    """
    slug = re.sub(r"[^a-z0-9]+", "-", f"{method} {path}".lower()).strip("-")
    return f"op-{slug}"


def _type_str(sch: dict, used: set[str]) -> str:
    """A readable type for a table cell. Records referenced component schema
    names in `used` so the page can render each one exactly once."""
    if not isinstance(sch, dict) or not sch:
        return "any"
    if "$ref" in sch:
        name = _ref_name(sch["$ref"])
        used.add(name)
        return f"[`{name}`](#{_anchor(name)})"
    if "allOf" in sch and len(sch["allOf"]) == 1:
        return _type_str(sch["allOf"][0], used)
    if "anyOf" in sch:
        # Pydantic renders Optional[X] as anyOf[X, null]; keep the order, dedupe.
        parts = list(dict.fromkeys(_type_str(s, used) for s in sch["anyOf"]))
        return " \\| ".join(parts)
    if "enum" in sch:
        return " \\| ".join(f"`{v}`" for v in sch["enum"])
    kind = sch.get("type")
    if kind == "array":
        return _type_str(sch.get("items", {}), used) + "[]"
    if kind == "null":
        return "null"
    if kind == "object":
        return "object"
    if kind == "string" and sch.get("format"):
        return f"string ({sch['format']})"
    return kind or "any"


def _fields_table(obj: dict, used: set[str]) -> list[str]:
    """Render an object schema's properties as a Markdown table."""
    props = obj.get("properties") or {}
    if not props:
        if obj.get("additionalProperties"):
            return ["A free-form JSON object.\n\n"]
        return ["_No fields._\n\n"]
    required = set(obj.get("required") or [])
    rows = ["| Field | Type | Required | Default | Notes |\n|---|---|---|---|---|\n"]
    for name, prop in props.items():
        default = prop.get("default", None)
        if default is None and "default" not in prop:
            default_s = ""
        else:
            default_s = f"`{json.dumps(default)}`"
        note = prop.get("description") or ""
        rows.append(
            f"| `{cell(name)}` | {_type_str(prop, used)} | "
            f"{'**yes**' if name in required else 'no'} | {default_s} | {cell(note)} |\n"
        )
    rows.append("\n")
    return rows


def _params_table(params: list, used: set[str]) -> list[str]:
    if not params:
        return []
    rows = [
        "**Parameters**\n\n",
        "| Name | In | Type | Required | Description |\n|---|---|---|---|---|\n",
    ]
    order = {"path": 0, "query": 1, "header": 2, "cookie": 3}
    for p in sorted(params, key=lambda p: (order.get(p.get("in"), 9), p.get("name", ""))):
        rows.append(
            f"| `{cell(p.get('name'))}` | {cell(p.get('in'))} | "
            f"{_type_str(p.get('schema') or {}, used)} | "
            f"{'**yes**' if p.get('required') else 'no'} | {cell(p.get('description'))} |\n"
        )
    rows.append("\n")
    return rows


def _sample_scalar(name: str, kind: str, sch: dict):
    """A realistic placeholder for one field.

    Keyed off the field NAME as well as the type, because `{"id": "string"}` is
    useless in a copy-paste example while `{"project_id": "p_8f3a"}` can be
    pasted into Swagger and edited.
    """
    n = name.lower()
    if kind == "boolean":
        return True
    if kind in ("integer", "number"):
        if n.endswith("_id") or n == "id":
            return 1
        if "count" in n or n.startswith("resolution") or n.startswith("texture_"):
            return 1
        if "order" in n or "index" in n:
            return 0
        if n in ("length", "breadth"):
            return 10
        if n.startswith("position") or n.startswith("rotation"):
            return 0
        if n.startswith("color"):
            return 128
        if n == "opacity":
            return 100
        return 0 if kind == "integer" else 0.0
    fmt = sch.get("format")
    if fmt == "date":
        return "2026-01-31"
    if fmt in ("time", "date-time"):
        return "12:00:00"
    if n.endswith("project_id"):
        return "p_8f3a2c"
    if n.endswith("scenario_id"):
        return "s_41bd90"
    if n.endswith("session_id") or n == "session-id":
        return "3f2a9c14e8b0"
    if "name" in n or "label" in n:
        return "Ground.001"
    if "path" in n or "file" in n:
        return "textures/soil.jpg"
    if "date" in n:
        return "2026-01-31"
    if "time" in n:
        return "12:00:00"
    if "unit" in n:
        return "Celsius"
    return "string"


def _example_value(name: str, sch: dict, root: dict, depth: int = 0):
    """Build a copy-pasteable example value for a schema node."""
    if not isinstance(sch, dict) or not sch:
        return {}
    if "$ref" in sch:
        if depth > 4:
            return {}
        target = root["components"]["schemas"].get(_ref_name(sch["$ref"]), {})
        return _example_value(name, target, root, depth + 1)
    if "allOf" in sch and len(sch["allOf"]) == 1:
        return _example_value(name, sch["allOf"][0], root, depth)
    if "examples" in sch and sch["examples"]:
        return sch["examples"][0]
    if "example" in sch:
        return sch["example"]
    if "enum" in sch and sch["enum"]:
        return sch["enum"][0]
    if "anyOf" in sch:
        # Optional[X] is anyOf[X, null] — show X, since a null example teaches
        # nothing about the field's shape.
        for branch in sch["anyOf"]:
            if branch.get("type") != "null":
                return _example_value(name, branch, root, depth)
        return None
    if "default" in sch and sch["default"] is not None:
        return sch["default"]
    kind = sch.get("type")
    if kind == "array":
        if depth > 3:
            return []
        return [_example_value(name, sch.get("items") or {}, root, depth + 1)]
    if kind == "object" or "properties" in sch:
        props = sch.get("properties") or {}
        if not props:
            # A free-form dict — `properties` on geometry/materials is this shape.
            if "propert" in name.lower():
                return {"length": 10, "breadth": 10}
            return {}
        if depth > 4:
            return {}
        return {k: _example_value(k, v, root, depth + 1) for k, v in props.items()}
    return _sample_scalar(name, kind or "string", sch)


def _request_example(op: dict, root: dict) -> str | None:
    """Pretty-printed JSON body for this operation, or None when it takes none."""
    content = (op.get("requestBody") or {}).get("content") or {}
    spec = content.get("application/json")
    if not spec:
        return None
    value = _example_value("body", spec.get("schema") or {}, root)
    if value in ({}, None):
        return None
    return json.dumps(value, indent=2)


def _load_response_shapes() -> dict:
    """Response bodies derived from the service code.

    FastAPI declares no `response_model` on these routes, so the OpenAPI schema
    types every success response as an empty `{}`. This file is the only source
    for what a route actually returns; it is produced by reading the code and is
    the one part of this page that is NOT machine-derived.
    """
    f = Path(__file__).with_name("response_shapes.json")
    if not f.exists():
        return {}
    data = json.loads(f.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def _render_op(method: str, path: str, op: dict, root: dict,
               shapes: dict, used: set[str]) -> list[str]:
    out = [f"### `{method} {cell(path)}` {{#{_op_anchor(method, path)}}}\n\n"]
    desc = (op.get("description") or "").strip()
    if desc:
        out.append("\n".join(line.rstrip() for line in desc.splitlines()) + "\n\n")
    elif op.get("summary"):
        out.append(f"{op['summary']}\n\n")

    out += _params_table(op.get("parameters") or [], used)

    body = (op.get("requestBody") or {}).get("content") or {}
    if body:
        media, spec = next(iter(body.items()))
        out.append(
            f"**Request body** — `{media}`"
            f"{'' if (op.get('requestBody') or {}).get('required') else ' (optional)'}\n\n"
        )
        example = _request_example(op, root)
        if example:
            out.append("Paste this into Swagger and edit the values:\n\n")
            out.append("```json\n" + example + "\n```\n\n")
        sch = spec.get("schema") or {}
        if "$ref" in sch:
            name = _ref_name(sch["$ref"])
            used.add(name)
            resolved = root["components"]["schemas"][name]
            out.append(f"Fields — [`{name}`](#{_anchor(name)}):\n\n")
            out += _fields_table(resolved, used)
        else:
            out += _fields_table(sch, used)

    key = f"{method} {path}"
    shape = shapes.get(key)
    if shape:
        ct = shape.get("content_type", "application/json")
        out.append(f"**Response** — `{shape.get('status', 200)}`, `{ct}`\n\n")
        example = (shape.get("example") or "").strip()
        if example:
            if ct == "application/json" and example.startswith(("{", "[")):
                out.append("```json\n" + example + "\n```\n\n")
            else:
                out.append(example + "\n\n")
        if shape.get("note"):
            out.append(f"{shape['note']}\n\n")
        meta_bits = []
        if shape.get("source"):
            meta_bits.append(f"Built by `{shape['source']}`")
        if shape.get("confidence") and shape["confidence"] != "certain":
            meta_bits.append(f"confidence: **{shape['confidence']}**")
        if meta_bits:
            out.append("*" + " · ".join(meta_bits) + ".*\n\n")
    else:
        out.append(
            "**Response** — not documented. No `response_model` is declared, so the schema "
            "types it as an empty object.\n\n"
        )
    out.append("---\n\n")
    return out


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
    components: dict = (schema.get("components") or {}).get("schemas") or {}
    shapes = _load_response_shapes()

    # Drop the dormant routers before anything is counted or rendered, so the
    # operation totals, the per-tag pages and the nav all describe the same
    # (live) surface. A tag whose every path is dormant produces no page at all;
    # the stale-file sweep below removes one left over from an earlier run.
    dormant_ops = sum(
        1
        for path, ops in paths.items()
        if path.startswith(DORMANT_PREFIXES)
        for method in ops
        if method in METHODS
    )
    paths = {p: ops for p, ops in paths.items() if not p.startswith(DORMANT_PREFIXES)}

    by_tag: dict[str, list[tuple[str, str, dict]]] = {}
    total = 0
    for path, ops in sorted(paths.items()):
        for method, op in ops.items():
            if method not in METHODS:
                continue
            total += 1
            tag = (op.get("tags") or ["untagged"])[0]
            by_tag.setdefault(tag, []).append((method.upper(), path, op))

    # ── Per-tag detail pages ────────────────────────────────────────────────
    OPS_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OPS_DIR.glob("*.md"):
        stale.unlink()

    documented = 0
    for tag, rows in by_tag.items():
        rows = sorted(rows, key=lambda r: (r[1], r[0]))
        used: set[str] = set()
        body: list[str] = []
        for method, path, op in rows:
            if f"{method} {path}" in shapes:
                documented += 1
            body += _render_op(method, path, op, schema, shapes, used)

        page = [BANNER, f"# `{tag}` endpoints\n\n", stamp(),
                f"{len(rows)} operations. See [Conventions](../http.md) for the headers, "
                "scoping and error shape they all share.\n\n"]
        page += body

        # Every component schema referenced above, rendered once. Resolving
        # transitively so a nested $ref never becomes a dead link.
        rendered: set[str] = set()
        queue = sorted(used)
        schema_blocks: list[str] = []
        while queue:
            name = queue.pop(0)
            if name in rendered or name not in components:
                continue
            rendered.add(name)
            nested: set[str] = set()
            schema_blocks.append(f"### `{name}`\n\n")
            obj = components[name]
            if obj.get("description"):
                schema_blocks.append(f"{obj['description']}\n\n")
            schema_blocks += _fields_table(obj, nested)
            queue += sorted(n for n in nested if n not in rendered)
        if schema_blocks:
            page.append("## Schemas\n\n")
            page += schema_blocks

        (OPS_DIR / f"{tag}.md").write_text("".join(page), encoding="utf-8")

    # ── Index page ──────────────────────────────────────────────────────────
    out = [BANNER, "# All endpoints\n\n", stamp()]
    out.append(
        f"**{total} operations** across **{len(paths)} paths**, generated from the FastAPI "
        "application's own OpenAPI schema.\n\n"
    )
    out.append(
        f"Request bodies and parameters come from the schema and cannot drift. Response bodies "
        f"are derived from the service code — {documented} of {total} are documented; see "
        "[Conventions](http.md#response-bodies).\n\n"
    )
    out.append(
        '!!! tip "The live schema is always available"\n'
        "    While the backend is running: **`/docs`** (Swagger UI) and **`/openapi.json`**.\n\n"
    )
    out.append(
        '!!! note "Every endpoint here is one the UI actually calls"\n'
        f"    {dormant_ops} further operations are mounted but unreachable from the renderer, "
        "and are\n    deliberately left out of this reference. They are listed in\n"
        "    [Dormant surface](../../reference/dormant.md) and still appear in the live "
        "`/docs` schema.\n\n"
    )
    for tag in sorted(by_tag):
        rows = sorted(by_tag[tag], key=lambda r: (r[1], r[0]))
        out.append(f"## [`{tag}`](ops/{tag}.md)\n\n")
        out.append("| Method | Path | Summary |\n|---|---|---|\n")
        for method, path, op in rows:
            summary = op.get("summary") or ""
            doc = (op.get("description") or "").strip().splitlines()
            if not summary and doc:
                summary = doc[0]
            link = f"ops/{tag}.md#{_op_anchor(method, path)}"
            out.append(
                f"| [`{method}`]({link}) | `{cell(path)}` | {cell(summary)} |\n"
            )
        out.append("\n")

    API_OUT.parent.mkdir(parents=True, exist_ok=True)
    API_OUT.write_text("".join(out), encoding="utf-8")
    _update_nav(sorted(by_tag))
    return total


def _update_nav(tags: list[str]) -> None:
    """Rewrite the generated block of the nav in mkdocs.yml.

    Keeps the per-router detail pages in the menu without anyone hand-editing a
    list that changes whenever a router is added.
    """
    cfg = REPO / "mkdocs.yml"
    text = cfg.read_text(encoding="utf-8")
    begin, end = "# BEGIN generated-api-nav", "# END generated-api-nav"
    if begin not in text or end not in text:
        print(f"[docs] WARNING: {begin} markers not found in mkdocs.yml — nav not updated")
        return
    head, rest = text.split(begin, 1)
    _, tail = rest.split(end, 1)
    indent = " " * (len(head) - len(head.rstrip(" ")))
    lines = [f"{indent}- {t}: dev/api/ops/{t}.md" for t in tags]
    cfg.write_text(
        head + begin + "\n" + "\n".join(lines) + "\n" + indent + end + tail,
        encoding="utf-8",
    )


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
