# Your first project

!!! warning "Planned — deliberately deferred"
    A step-by-step tutorial is the most volatile page in this site: every sentence in it is
    invalidated when a button moves. The UI is still changing, so writing it now means rewriting
    it next month.

    It will be written once the project and geometry screens settle.

## What it will cover

1. Creating a project, and what a **scenario** is (every project has at least one).
2. Adding a ground and setting its dimensions.
3. Creating a material and assigning it to the ground.
4. Loading weather data.
5. Saving, closing, and reopening — and what is preserved.

## In the meantime

The concepts behind each of those steps are already documented and will not change:

- [Projects & storage](../concepts/projects.md) — what a project and a scenario are, and what is
  saved where.
- [Geometry & primitives](../concepts/primitives.md) — objects versus primitives.
- [Materials & textures](../concepts/materials.md) — how a material is built and assigned.

!!! tip "Start small"
    Ground size dominates everything — memory, load time, responsiveness. A 1000×1000 ground needs
    roughly 2 GB on its own. Build the workflow you want on a small ground first, then scale it up.
