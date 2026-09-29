# Recipes

Step-by-step instructions for tasks you will do more than once.

These are **how-to** pages, distinct from the rest of the developer docs:

| Page type | Answers | Shape |
|---|---|---|
| [Architecture](../arch/processes.md) | How does this work? | Prose and diagrams |
| Feature guides | Where does this live? | File maps |
| **Recipes** | **How do I add one?** | **Numbered steps** |

Recipes exist because in Helios the obvious approach is often the wrong one. A large part of the
application is **data, not code** — object types, material types, their properties, ranges and
form layout are rows in catalog tables. A developer's first instinct is to open a `.tsx` file;
the correct answer is usually a migration.

Read [The property system](../arch/properties.md) before any of the catalog recipes. It explains
the mechanism these steps operate on.

## The recipes

| Recipe | Status |
|---|---|
| [Add an object type](add-object-type.md) | ✅ Written |
| [Add a property to a type](add-property.md) | ✅ Written |
| [Add a material type](add-material-type.md) | ✅ Written |
| [Add an API endpoint](add-endpoint.md) | ✅ Written |
| [Add a screen](add-screen.md) | ✅ Written |
| [Add a migration](add-migration.md) | ✅ Written |

## The shape of a recipe

Each one follows the same structure, so they are skimmable once you have read one:

1. **When to use this** — and when you want a different recipe.
2. **Before you start** — what to read, what to have running.
3. **The steps**, numbered, with the file to open at each.
4. **Verify** — how to confirm it worked, per step where possible.
5. **Common mistakes** — the silent failures, which is where most time is lost.

!!! tip "Silent failures are the point"
    Most of these tasks fail *quietly*: the type does not appear, or appears with no form, or
    validates nothing. No error is raised. Every recipe lists what each missed step looks like, so
    you can work backwards from a symptom.
