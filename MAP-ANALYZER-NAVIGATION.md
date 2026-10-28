# Map Analyzer: identity, navigation and WIP metadata

28 October 2026. Baseline before this change: `c8302b8` / `unified-measurement-assets-2026-10-28`.

## Behavior

- Each sample with loaded measurements has its own header showing the complete ID and nomenclature. A known parent appears as a secondary hint. Identity resolution prioritizes the stored sample UUID, exact sample code, bounded filename/folder code, and finally an unambiguous display name. `A23` no longer captures `A23-c3` through a substring match.
- Acquisition/derived-file relationships remain below their actual sample. Identical basenames in different directories no longer discard acquisitions. Ancestry traversal stops on cycles.
- Search accepts sample IDs/names, pipeline names and displayed measurement parameters. Expand/collapse controls reduce scrolling. Saved Sessions starts collapsed, stays available through its header, and no longer hides sessions beyond the first eight.
- Decimal laser, power and time values are classified correctly. Approximate color families aid navigation: violet/blue/green/yellow-orange/red; UV and infrared have explicit text labels. 633 nm uses red; 785 nm is labelled NIR rather than given an invented visible color. The numeric value always remains visible.

## Metadata and WIP integration

The Supabase explorer builds file entries from the characterization's sample identity and reviewed parameters (the versioned asset manifest is preferred). Source HDF5 attributes provide these fields for local discovery and generated results. The filename is only a fallback for old entries without available parameters. The Spot filename suffix remains a human acquisition label, not a substitute for instrument metadata.

The explorer now reads `file_metadata.grid.x/y` for pixel dimensions, keeping `range` for spectral bounds. A local scan reads actual array geometry. Importing merges structural metadata with the reviewed cloud parameters. Selecting an old cached entry without parameters reads only its HDF5 headers and shape, without loading arrays or hashing the file. Recovery/staging directories are excluded from active vault discovery.

Physical extent comes from the reviewed Size parameter with units, separately from the pixel grid. For equal X/Y pitch, the viewer initializes the scalar step setting from that geometry; e.g. 50×50 pixels over 200×200 µm gives 4 µm/pixel. If the pitches differ, the displayed physical extent is still retained, but the existing downstream scalar-step algorithms are not converted to anisotropic calibration by this change. Manual step/grid overrides remain supported. No spectral-processing formulas are changed.

Supabase continues to back up acquisition metadata, reviewed parameters, source project/object references, relationships and stored workspace settings. Original WIP/HDF5/image bytes remain in the configured local/synced roots, as requested; no binary Storage uploads are added. The existing WIP cloud record was checked for original metadata and reviewed parameters. No database migration is required.

## Verification and operation

Run `node scripts/test-workspace-display.mjs`, `node scripts/test-workspace-render.mjs`, `python python-engine/tests/test_wip_map_analyzer.py`, TypeScript and targeted ESLint. The integration test extracts an actual private WIP acquisition to a temporary vault, deliberately renames the HDF5 to a misleading laser name, checks metadata/geometry via local HTTP, compares heatmap/spectrum values against the stored arrays, rejects an external origin and excludes a recovery copy. It verifies the original WIP hash is unchanged. This is not a certification against the vendor's TXT exporter.

Restart the Python engine after updating. Reopen the analyzer to load updated cloud identity fields. Old workspace entries are enriched when selected; a legacy filename fallback may appear until that local read completes. Full parameter metadata is carried into newly saved workspaces.

Rollback: revert this change's commit and redeploy. There are no data migrations or bulk edits to scientific files. Keep existing Supabase records and the complete synced Data Vault. The previous version is tagged `unified-measurement-assets-2026-10-28`.
