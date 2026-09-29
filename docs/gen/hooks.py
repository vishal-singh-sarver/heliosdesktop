"""MkDocs hooks for the documentation site (registered under `hooks:` in mkdocs.yml).

The offline copy is opened from file://, where the browser blocks fetch/XHR.
`navigation.instant` fetches sitemap.xml on every page load; on file:// that
request fails and takes down all of Material's page JavaScript with it. The
visible symptoms were: sidebars not sized to the viewport (stray scrollbars,
navigation running over the footer), no table-of-contents tracking, no copy
buttons, and Mermaid rendering "Syntax error in text" because it parsed the raw
code block itself instead of being driven by Material.

Material's offline plugin does not switch the feature off, so this does, and
only for the offline build — the served site keeps instant navigation.
"""
from __future__ import annotations


def on_config(config):
    offline = config.plugins.get("material/offline")
    if offline and offline.config.enabled:
        features = config.theme["features"]
        if "navigation.instant" in features:
            features.remove("navigation.instant")
    return config
