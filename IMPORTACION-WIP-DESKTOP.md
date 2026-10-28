# WITec project import — desktop

## Usage

In Tauri, open **Import .wip** from Samples, or **Add .wip** in a Raman characterization. Open the local project, select measurements/images, assign their destination samples and review the parameters before **Import selected**. The project remains open so more items can be assigned to other samples.

The list follows the source Data sequence. Captions are preserved; object IDs distinguish repeated names. Filename sample matches and image-position matches are suggestions requiring confirmation.

The parameter order matches manual Raman entry: Analyte, Laser, Power, Objective, Acquisition Time, Accumulations, Spots, Size. Analyte starts blank. Power can be prefilled from an explicit uW/µW/mW token in the measurement caption and offers unit selection; the suggestion is marked for review. Spots uses the stored pixel dimensions; Size uses the physical scan span in micrometres. For example, 50×50 pixels over 200×200 µm remains two different values. Missing metadata stays blank except the labelled, editable 1-ac default for a recognized Area Scan when no explicit accumulation count exists. Original acquisition metadata and reviewed values are kept separately.

**Metadata** opens Measurements, Data History and Source Details before import and from the saved characterization. Source Details retains calibration references, source byte ranges, unknown acquisition parameters and the original file hash.

For camera images, **Calibrated Microscopy Image** supports scale bars, map outlines, source point grids, zoom/pan and annotated PNG export. Dragging a map onto the image selects its stored acquisition area; it does not alter its coordinates. After import, use **Open calibrated image** in the characterization. Only maps from the same project hash and instrument frame can be overlaid. Explicit units and calibrated affine transformations are required; missing calibration, conflicting scan spans and tilted 3D planes disable the overlay. Source files/images remain unchanged.

## Runtime and storage

Desktop only. Install `python-engine/requirements.txt` in the Python environment running the science engine, then restart that engine (`python start.py` inside `python-engine`). The launcher binds to 127.0.0.1:8888. Restarting the frontend alone does not load new Python routes. A stale engine returns a message explaining that restart is needed.

WIP content is parsed locally with a bounded tag index and `witio==0.2.0`. Large numeric leaves use read-only memory maps. No WIP is uploaded. Confirmed Raman selections produce vault HDF5 files; camera selections produce PNGs and provenance archives. Supabase stores the reviewed characterization and provenance. The existing native Google queue stores a small signed Raman reference, not the source project.

A deterministic import ID covers group, sample, source hash, object, reviewed settings and selected images. Retrying identical input reuses local output and the existing database record without overwriting it. Changing the assignment/settings intentionally creates a different import. If database linking fails, local extraction remains available for retry.

## Validation and limits

- TypeScript checking and targeted ESLint: no errors; existing warnings remain in the surrounding characterization screens.
- Node tests cover parameter ordering, explicit units, manual-only fields, physical size vs grid size, rotated affine overlays and coordinate-frame rejection.
- Python tests cover corrupt input, origin checks, duplicate captions/order, unchanged source hash, image previews, source-array/HDF5 equality and identical retry results. All 22 Raman objects in the private A19 example were compared with decoded source arrays, including axes and numeric types.
- Spatial tests cover rotation, negative Y direction, point grids, frame rejection and full-resolution derived PNGs without modifying the original.
- Database transaction tests exercise authenticated create, retry/no-overwrite, cross-group rejection and reference owner validation; all test changes are rolled back. The RPC is SECURITY INVOKER and unavailable to anon.
- This is not yet an independent point-by-point comparison against a vendor TXT export. Optical orientation, pixel-centre/boundary convention and less common WITec object types should be checked against WITec before scientific publication. The interface labels this limitation.
- Only calibrated Raman-shift graphs and supported RGB camera bitmaps can be imported. Other objects remain inspectable. Decoding is capped at 512 MB per object; sessions expire after four hours and at most three projects remain cached. Grids show at most 5,000 points; overlays allow 12 maps at once.

## Recovery

Baseline application commit: `08b065e`. This feature is isolated in one Git commit; use `git revert <WIP feature commit>` and deploy the revert to recover prior application behavior. Do not use a destructive reset on a checkout containing local work.

The database migration is `db/changes/wip_import.sql` (already applied). If removing it, revert the application first, then apply `db/rollback/wip_import.sql`. That rollback only removes the import RPC; it does not delete characterizations or local vault files. Existing records remain available. Private Reference WIPs, OAuth files and unrelated local changes are excluded from the feature commit.

## Follow-up fixes: image detection and sample search

Measurement outlines are red and thicker in the viewer and exported PNGs. The default list shows only measurements whose calibrated footprints intersect the image. Completely contained measurements are labelled **Inside image**; partial intersections are **Partially inside image**. **Show detected** selects up to 12 matches. **Include outside / unlocated measurements** exposes the remaining entries for inspection without assigning invented positions. Single-pixel measurements render as points; one-dimensional scans render as lines. Detection does not automatically attach an image or change sample assignment.

Both destination sample fields now search the server by ID prefix after 250 ms, return at most 20 matches within the active group, and require explicit selection. Empty searches do not retrieve the sample catalog. Previously selected samples remain available for the current import session.

The original importer mistakenly stored pixel dimensions in `file_metadata.range`. That property is reserved for the two spectral bounds. New imports store a separate `grid`, and use the decoded spectral axis for `range`. The detail sheet validates both bounds before formatting them, so existing records with the old malformed property can be opened without reimporting or changing their source data. An unavailable spectral range is omitted rather than inferred from pixel counts.

Regression checks: `node scripts/test-wip-parameters.mjs`, `node scripts/test-wip-sample-search.mjs`, `python python-engine/tests/test_wip_spatial.py`, `python python-engine/tests/test_wip_import.py`, TypeScript and targeted ESLint. Revert this follow-up commit to recover the previous interface; it adds no database migration and deletes no imported records.

## Unified Raman records for new imports

Select a Raman acquisition and camera image, assign them to the same sample and review them. Calibrated intersections link the image into the Raman record automatically; the import summary shows the number of resulting records and each image's Raman links. **Attach detected images** in the Raman review can also explicitly attach matching images without selecting a separate image record. Images can be manually attached where calibration is unavailable. Confirmed attachments are saved in the same characterization's `attached_images` and `wip_import.attached_image_metadata`, together with the map's HDF5 reference and the standard Raman parameters.

Attached-image provenance includes its original and reviewed metadata, history, raw acquisition parameters, spatial geometry and calibration references. **Image metadata** opens these values from the Raman detail sheet. Image parameters do not replace the Raman parameters. A shared image may accompany several Raman acquisitions, each remaining one complete Raman record.

Standalone Optical Image records require the explicit **Create standalone image records when no Raman measurement is linked** option. An unlinked selected image otherwise blocks import with an explanation instead of silently creating a separate record. Partial failures retain failed selections for retry and mark an image complete only after all its planned Raman links succeed. Existing separate Optical Image/Raman records are unchanged, as requested.


## Persisted image annotations, source traceability and display precision

Detected measurement areas and a suitable scale bar start enabled. The import preview keeps per-image choices (including hidden areas, scale length, and point grid) when navigating between objects. On confirmed import, the local engine saves a derived annotated PNG as the characterization's displayed attachment, retains the original RGB PNG separately, and stores the chosen settings and source measurement geometries alongside image provenance. The calibrated viewer opens the original image with the saved settings, avoiding double annotation. Hiding all areas and the scale explicitly preserves that choice. Export and import use the same calibrated coordinates and scale.

`source_file_path` records the selected WIP location exactly as supplied; `resolved_source_file_path` also records the resolved path. The original project is not moved or uploaded. The detail sheet shows **Source WITec project**. This applies to new imports; older records without a stored path are not assigned a guessed location.

The WITec scan-pattern GUID `{4C398196-DD48-4EE4-95F4-1E23F2AF96C1}` is labelled **Area Scan**, matching the provided WITec Meta Info. When the source has no explicit accumulation count, the review uses 1 ac as a labelled editable default. This is not represented as an original instrument count and never replaces an explicit count. Other unknown methods remain unset.

Power suggestions accept bounded tokens such as `-500uW-`, `-0.5mW-`, `µW` and `μW` in the measurement caption. Conflicting power tokens remain blank. The source caption and the suggestion's origin remain available separately from reviewed values. No other filename metadata is inferred.

Laser values display at most one decimal (632.7999877929688 → 632.8 nm) in the characterization table, history summary and metadata table. Full precision remains in stored acquisition metadata and Source Details.
