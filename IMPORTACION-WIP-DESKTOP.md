# WITec project import — desktop

## Usage

In Tauri, open **Import .wip** from Samples, or **Add .wip** in a Raman characterization. Open the local project, select measurements/images, assign their destination samples and review the parameters before **Import selected**. The project remains open so more items can be assigned to other samples.

The list follows the source Data sequence. Captions are preserved; object IDs distinguish repeated names. Filename sample matches and image-position matches are suggestions requiring confirmation.

The parameter order matches manual Raman entry: Analyte, Laser, Power, Objective, Acquisition Time, Accumulations, Spots, Size. Analyte and Power start blank and offer unit selection. Spots uses the stored pixel dimensions; Size uses the physical scan span in micrometres. For example, 50×50 pixels over 200×200 µm remains two different values. Missing metadata stays blank. Original acquisition metadata and reviewed values are kept separately.

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
