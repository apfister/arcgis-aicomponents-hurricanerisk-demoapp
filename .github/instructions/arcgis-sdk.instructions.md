---
description: Reference the installed @arcgis package type declarations as the source of truth for the ArcGIS JS API.
applyTo: "src/**/*.ts,src/**/*.tsx"
---

# ArcGIS Maps SDK for JavaScript — Authoritative Source

This project uses the ArcGIS Maps SDK for JavaScript (`@arcgis/core` and `@arcgis/map-components`). The public web docs at developers.arcgis.com are a client-rendered SPA whose content cannot be reliably fetched/parsed by tools, so do NOT rely on them. Instead, treat the **installed package's TypeScript declaration files** as the authoritative API reference.

Whenever a request involves the ArcGIS JavaScript API — maps, views, layers, widgets, navigation, web components, modules, classes, properties, methods, or events — verify the exact API surface against the installed packages before answering or writing code:

- Core classes/modules: `node_modules/@arcgis/core/**/*.d.ts` (e.g. `node_modules/@arcgis/core/WebMap.d.ts`, `node_modules/@arcgis/core/layers/FeatureLayer.d.ts`, `node_modules/@arcgis/core/views/MapView.d.ts`).
- Web components / custom-element attributes: `node_modules/@arcgis/map-components/**/*.d.ts`.

## Rules

- Confirm class names, property names, method signatures, module paths, and web-component attributes by reading the relevant `.d.ts` file. Do not rely on memorized or outdated signatures.
- Use the version actually installed (check `node_modules/@arcgis/core/package.json`). The declarations in `node_modules` always match the version this project builds against — prefer them over any external page.
- To locate a symbol, prefer the workspace search tools scoped to `node_modules/@arcgis` (in PowerShell: `Select-String -Path node_modules/@arcgis/core/**/*.d.ts -Pattern "SymbolName"`).
- If a name cannot be confirmed in the installed declarations, say so rather than inventing it.
- Do not consult third-party tutorials, blog posts, or older SDK versions for ArcGIS JS API specifics; treat the installed `@arcgis` type declarations as the source of truth.
