'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Sample, SampleCharacterization } from '../types';
import { createCharacterizationAction, updateCharacterizationAction, getGroupCharacterizationTypesAction, getLastCharacterizationParamsAction } from '../actions';
import { toast } from 'sonner';
import { X, Save, FileText, Plus, Trash2, Microscope, FileJson, ChevronUp, ChevronDown, Loader2, ExternalLink, FolderOpen, GripVertical, List, Activity, HardDrive, CheckCircle2, AlertCircle, Clipboard, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadFileToDrive } from '@/lib/google/upload';
import { ensureAuth } from '@/lib/google/auth';
import { isDesktop, ingestFile, checkEngineHealth, SCIENCE_ENGINE_URL, fetchRepresentativeSpectrum, savePastedImage, renameVaultFiles } from '@/lib/desktop';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';


interface CharacterizationModalProps {
    groupId: string;
    logbookName: string;
    isOpen: boolean;
    onClose: () => void;
    sample: Sample;
    initialData?: SampleCharacterization | null;
    // Unit history props
    parameterUnits: Record<string, string[]>;
    setParameterUnits: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    lastUnits: Record<string, string>;
    setLastUnits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    // Parameter Order Props
    parameterOrder: Record<string, string[]>;
    setParameterOrder: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    // Drive settings
    driveSettings?: { clientId?: string; apiKey?: string; folderId?: string; sampleFolderId?: string };
}

const DEFAULT_CHAR_TYPES = ['Raman', 'AFM', 'SEM', 'UV-Vis', 'X-Ray'];
const ADD_NEW_OPTION = '___ADD_NEW___';

export function CharacterizationModal({
    groupId,
    logbookName,
    isOpen,
    onClose,
    sample,
    initialData,
    parameterUnits,
    setParameterUnits,
    lastUnits,
    setLastUnits,
    parameterOrder,
    setParameterOrder,
    driveSettings
}: CharacterizationModalProps) {
    const [type, setType] = useState(DEFAULT_CHAR_TYPES[0]);
    const [equipment, setEquipment] = useState('');
    const [dataFields, setDataFields] = useState<{ key: string; value: string; unit: string }[]>([{ key: '', value: '', unit: '' }]);
    const [notes, setNotes] = useState('');
    const [fileOrigin, setFileOrigin] = useState('');
    const [driveFileLink, setDriveFileLink] = useState('');
    const [performedAt, setPerformedAt] = useState(new Date().toISOString().split('T')[0]);
    const [ramanSpectrum, setRamanSpectrum] = useState('');

    // Desktop file ingestion state
    const [localFilePaths, setLocalFilePaths] = useState<string[]>([]);
    const [ingestStatus, setIngestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [h5RelativePaths, setH5RelativePaths] = useState<string[]>([]);
    const [fileMetadata, setFileMetadata] = useState<Record<string, { range?: [number, number], points?: number, spectra?: number }>>({});
    const [spectrumPreviewB64, setSpectrumPreviewB64] = useState('');
    const [engineOnline, setEngineOnline] = useState(false);

    // Pasted images state (additional data)
    const [pastedImages, setPastedImages] = useState<Array<{ id: string; base64?: string; name: string; relativePath?: string }>>([]);
    const [isDragging, setIsDragging] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const triggerFileSelect = () => {
        imageInputRef.current?.click();
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64 = event.target?.result as string;
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const newImg = {
                            id: `paste-${Date.now()}-${Math.random()}`,
                            base64,
                            name: `Pasted_Image_${timestamp.split('T')[0]}_${timestamp.split('T')[1].slice(0, 8).replace(/-/g, '')}.png`
                        };
                        setPastedImages(prev => [...prev, newImg]);
                        toast.success("Image pasted from clipboard!");
                    };
                    reader.readAsDataURL(blob);
                }
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer?.files;
        if (!files) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.indexOf('image') !== -1) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64 = event.target?.result as string;
                    const newImg = {
                        id: `drop-${Date.now()}-${Math.random()}`,
                        base64,
                        name: file.name
                    };
                    setPastedImages(prev => [...prev, newImg]);
                    toast.success(`Loaded image: ${file.name}`);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target?.result as string;
                const newImg = {
                    id: `file-${Date.now()}-${Math.random()}`,
                    base64,
                    name: file.name
                };
                setPastedImages(prev => [...prev, newImg]);
                toast.success(`Loaded image: ${file.name}`);
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const currentVaultRoot = typeof window !== 'undefined' ? localStorage.getItem('phdnexus_vault_root') : null;

    const renderAttachedImagesList = () => {
        if (pastedImages.length === 0) return null;

        return (
            <div className="space-y-2 mt-4">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Attached Images & Bitmaps ({pastedImages.length})
                </label>
                <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto p-1.5 bg-slate-100/50 rounded-lg border border-slate-200/50">
                    {pastedImages.map((img) => {
                        let src = '';
                        if (img.base64) {
                            src = img.base64;
                        } else if (img.relativePath && currentVaultRoot) {
                            src = `${SCIENCE_ENGINE_URL}/api/vault-file?path=${encodeURIComponent(img.relativePath)}&vault_root=${encodeURIComponent(currentVaultRoot)}`;
                        }

                        return (
                            <div key={img.id} className="relative group border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow transition-all aspect-video">
                                {src ? (
                                    <img src={src} alt={img.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
                                        <Image size={24} />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2">
                                    <span className="text-[9px] text-white font-semibold truncate bg-black/60 px-1.5 py-0.5 rounded self-start max-w-full">
                                        {img.name}
                                    </span>
                                    <div className="flex gap-2 justify-end">
                                        {img.relativePath && (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenFileDirectly(img.name, img.relativePath)}
                                                className="p-1 bg-white/95 hover:bg-white text-slate-700 rounded transition-colors"
                                                title="Open physically"
                                            >
                                                <ExternalLink size={10} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setPastedImages(prev => prev.filter(item => item.id !== img.id))}
                                            className="p-1 bg-red-600/90 hover:bg-red-600 text-white rounded transition-colors"
                                            title="Remove image"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    
    // Dynamic Types
    const [availableTypes, setAvailableTypes] = useState<string[]>(DEFAULT_CHAR_TYPES);
    const [isAddingCustomType, setIsAddingCustomType] = useState(false);
    const [customTypeName, setCustomTypeName] = useState('');

    // UI States
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
    const [scriptsLoaded, setScriptsLoaded] = useState(false);
    const [updateBatch, setUpdateBatch] = useState(false);
    const [hasBulkId, setHasBulkId] = useState(false);

    // Initialize Google Scripts
    useEffect(() => {
        if (isOpen && driveSettings?.apiKey && driveSettings?.clientId) {
            if (!scriptsLoaded) {
                import('@/lib/google/auth').then(({ initGoogleClient }) => {
                    initGoogleClient(driveSettings.apiKey!, driveSettings.clientId!)
                        .then(() => {
                            setScriptsLoaded(true);
                        })
                        .catch((e) => console.warn('Google init failed:', e));
                });
            }
        }
        // Check Python engine health when on desktop
        if (isOpen && isDesktop) {
            checkEngineHealth().then(setEngineOnline);
        }

        // Fetch dynamic types
        if (isOpen) {
            getGroupCharacterizationTypesAction(groupId).then(res => {
                if (res.data) {
                    const merged = Array.from(new Set([...DEFAULT_CHAR_TYPES, ...res.data]));
                    setAvailableTypes(merged);
                }
            });
        }
    }, [isOpen, driveSettings, scriptsLoaded, groupId]);

    const handleSelectRawFile = async () => {
        try {
            const selected = await open({
                multiple: true,
                title: 'Select Raw Data File(s)',
                filters: (type === 'Raman' || type === 'SERS') 
                    ? [{ name: 'Data Files', extensions: ['txt', 'mat', 'csv', 'h5', 'hdf5'] }]
                    : undefined
            });
            if (selected) {
                setLocalFilePaths(Array.isArray(selected) ? selected : [selected]);
                setIngestStatus('idle'); // Reset status on new selection
            }
        } catch (err) {
            console.error('Error opening dialog:', err);
        }
    };

    const handleDesktopFileIngest = async () => {
        if (localFilePaths.length === 0) {
            toast.error('Please select at least one raw data file.');
            return;
        }
        
        const currentVaultRoot = typeof window !== 'undefined' ? localStorage.getItem('phdnexus_vault_root') : null;
        if (!currentVaultRoot || !currentVaultRoot.trim()) {
            toast.error('Local Data Vault Root is not configured. Please set it up in Group Settings > Drive Integration.');
            return;
        }

        setIngestStatus('loading');
        try {
            const analyte = dataFields.find(f => f.key.toLowerCase().includes('analyte'))?.value || '';
            const laserField = dataFields.find(f => f.key.toLowerCase().includes('laser'))?.value || '';
            const laserNm = parseInt(laserField.replace(/\D/g, '')) || undefined;
            const powerField = dataFields.find(f => f.key.toLowerCase().includes('power'))?.value || '';
            const powerUw = parseFloat(powerField.replace(/[^\d.]/g, '')) || undefined;

            const parameters: Record<string, string> = {};
            dataFields.forEach(f => {
                const val = (typeof f.value === 'string' ? f.value : '').trim();
                const unit = (f.unit || '').trim();
                if (val) {
                    parameters[f.key] = unit ? `${val} ${unit}` : val;
                }
            });

            const newH5Paths: string[] = [...h5RelativePaths];
            const newMeta = { ...fileMetadata };
            let lastPreview = '';

            for (const filePath of localFilePaths) {
                // Skip if already in list (basic check)
                if (initialData?.data?.original_files?.includes(filePath)) continue;
                // Avoid re-ingesting if we already have it in newH5Paths (from a previous partial ingest)
                // Actually, let's just re-ingest to be safe if it's in localFilePaths but not yet committed
                
                const result = await ingestFile({
                    file_path: filePath.trim(),
                    vault_root: currentVaultRoot.trim(),
                    group_id: groupId,
                    sample_id: sample.id,
                    sample_code: sample.sample_code,
                    sample_name: sample.name,
                    logbook_name: logbookName,
                    analyte,
                    laser_wavelength_nm: laserNm,
                    laser_power_uw: powerUw,
                    technique: type,
                    parameters,
                    is_generic: !(type === 'Raman' || type === 'SERS')
                });
                
                newH5Paths.push(result.h5_relative_path);
                if (result.preview_base64) lastPreview = result.preview_base64;
                
                newMeta[result.h5_relative_path] = {
                    range: result.wavenumber_range,
                    points: result.n_points,
                    spectra: result.n_spectra
                };
            }

            setH5RelativePaths(Array.from(new Set(newH5Paths)));
            setFileMetadata(newMeta);
            // Append rather than replace original file paths
            if (initialData) {
                 const ogFiles = initialData?.data?.original_files || [];
                 const combined = Array.from(new Set([...ogFiles, ...localFilePaths]));
                 setLocalFilePaths(combined);
            }
            if (lastPreview) setSpectrumPreviewB64(lastPreview);
            setIngestStatus('success');
            toast.success(`${newH5Paths.length - h5RelativePaths.length} new file(s) processed into Data Vault`);
        } catch (err: any) {
            setIngestStatus('error');
            toast.error(err.message || 'Python engine error');
        }
    };

    // Remove an ingested file
    const handleRemoveIngestedFile = (index: number) => {
        setH5RelativePaths(prev => prev.filter((_, i) => i !== index));
        setLocalFilePaths(prev => prev.filter((_, i) => i !== index));
    };

    // Open file origin or vault folder in native explorer
    const handleOpenFolder = async () => {
        if (!isDesktop) return;
        try {
            const currentVaultRoot = typeof window !== 'undefined' ? localStorage.getItem('phdnexus_vault_root') : null;
            const { open: openShell } = await import('@tauri-apps/plugin-shell');
            let targetPath = '';
            
            // Try h5 vault path first
            if (h5RelativePaths.length > 0 && currentVaultRoot) {
                const firstPath = h5RelativePaths[0];
                const parts = firstPath.split(/[/\\]/);
                parts.pop(); // remove filename
                targetPath = `${currentVaultRoot}/${parts.join('/')}`;
            } 
            // Fallback to file_origin
            else if (fileOrigin) {
                targetPath = fileOrigin;
            }
            // Fallback to vault root
            else if (currentVaultRoot) {
                targetPath = currentVaultRoot;
            }
            
            if (targetPath) {
                // Use native Rust command to bypass frontend shell regex limitations
                await invoke('open_local_folder', { path: targetPath });
            } else {
                toast.error("No folder path available to open.");
            }
        } catch (e) {
            console.error("Failed to open folder", e);
            toast.error("Could not open folder. Make sure the path exists.");
        }
    };

    const handleOpenFileDirectly = async (originalPath: string, relativeVaultPath?: string) => {
        if (!isDesktop) return;
        try {
            const currentVaultRoot = typeof window !== 'undefined' ? localStorage.getItem('phdnexus_vault_root') : null;
            let targetPath = originalPath;
            if (relativeVaultPath && currentVaultRoot) {
                targetPath = `${currentVaultRoot}/${relativeVaultPath}`;
            }
            await invoke('open_local_folder', { path: targetPath });
        } catch (err) {
            console.error("Failed to open file", err);
            toast.error("Failed to open file.");
        }
    };

    // Load Initial Data
    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // Edit Mode
                setType(initialData.type);
                setEquipment(initialData.data.equipment || '');
                setNotes(initialData.data.notes || '');
                setFileOrigin(initialData.data.file_origin || '');
                setDriveFileLink(initialData.data.drive_file_link || '');
                setPerformedAt(initialData.performed_at ? initialData.performed_at.split('T')[0] : new Date().toISOString().split('T')[0]);
                setHasBulkId(!!initialData.data?.__bulk_id__);
                setRamanSpectrum(''); // Always reset for new session
                
                // Desktop Edit Mode fields
                const h5Paths = initialData.data.local_h5_paths || (initialData.data.local_h5_path ? [initialData.data.local_h5_path] : []);
                setH5RelativePaths(h5Paths);
                const ogFiles = initialData.data.original_files || (initialData.data.original_file ? [initialData.data.original_file] : []);
                setLocalFilePaths(ogFiles);
                const meta = initialData.data.file_metadata || {};
                setFileMetadata(meta);

                const attached = initialData.data.attached_images || [];
                const loadedImages = attached.map((path: string, idx: number) => {
                    const filename = path.split('/').pop() || `Attached Image ${idx + 1}`;
                    return {
                        id: `saved-${idx}-${Date.now()}`,
                        name: filename,
                        relativePath: path
                    };
                });
                setPastedImages(loadedImages);


                const fields: { key: string; value: string; unit: string }[] = [];
                const data = initialData.data;
                const order = data.__order__ as string[] || []; // Prefer saved order in record

                const separateUnit = (val: string): { v: string; u: string } => {
                    const match = val.match(/^([\d\.]+)\s*([a-zA-Z%μµ°Ω]+)$/);
                    if (match) return { v: match[1], u: match[2] };
                    if (val.match(/^x\d+$/)) return { v: val.replace('x', ''), u: 'x' };
                    if (val.match(/^\d+x$/)) return { v: val.replace('x', ''), u: 'x' };
                    return { v: val, u: '' };
                };

                const processedKeys = new Set<string>();

                // 1. Process Ordered Keys
                order.forEach(k => {
                    if (data[k] !== undefined) {
                        const { v, u } = separateUnit(String(data[k]));
                        fields.push({ key: k, value: v, unit: u });
                        processedKeys.add(k);
                    }
                });

                // 2. Process Remaining Keys
                Object.entries(data).forEach(([k, v]) => {
                    const systemKeys = ['equipment', 'notes', '__order__', 'file_origin', 'drive_file_link', 'local_h5_paths', 'original_files', 'local_h5_path', 'original_file', 'raman_spectrum_file_id', '__bulk_id__', 'file_metadata', 'attached_images', 'attached_image'];
                    if (!processedKeys.has(k) && !systemKeys.includes(k)) {
                        const { v: val, u: unit } = separateUnit(String(v));
                        fields.push({ key: k, value: val, unit: unit });
                    }
                });

                setDataFields(fields.length > 0 ? fields : [{ key: '', value: '', unit: '' }]);

            } else {
                // New Mode
                // Reset basic fields
                setEquipment('');
                setNotes('');
                setFileOrigin('');
                setDriveFileLink('');
                setPerformedAt(new Date().toISOString().split('T')[0]);
                setHasBulkId(false);
                setUpdateBatch(false);
                setRamanSpectrum('');
                setH5RelativePaths([]);
                setLocalFilePaths([]);
                setPastedImages([]);
                setSpectrumPreviewB64('');
                setIngestStatus('idle');
                setFileMetadata({});


                // Set type (default Raman or keep last? typically default to first)
                // Actually if we just opened, we can default to Raman.
                // But let's check if we should trigger the type change logic manually to load defaults.
                handleTypeSelection(DEFAULT_CHAR_TYPES[0]);
            }
        }
    }, [isOpen, initialData]);

    const handleTypeSelection = (newType: string) => {
        if (newType === ADD_NEW_OPTION) {
            setIsAddingCustomType(true);
            setType('Other'); // Internal fallback
            setCustomTypeName('');
            return;
        }

        setIsAddingCustomType(false);
        setType(newType);

        // Load defaults or cached fields for this type if creating new
        if (!initialData) {
            let loadedFromCache = false;
            if (typeof window !== 'undefined') {
                const lastParamsJson = localStorage.getItem(`phdnexus_last_params_${newType}`);
                if (lastParamsJson) {
                    try {
                        const cachedFields = JSON.parse(lastParamsJson);
                        // Only trust this cache if it has at least one non-empty value
                        // (guards against the old bug that stored all values as '')
                        const hasRealValues = Array.isArray(cachedFields) &&
                            cachedFields.some((f: any) => f.value && f.value.trim() !== '');
                        if (hasRealValues) {
                            const newFields = cachedFields.map((f: any) => ({
                                key: f.key,
                                value: '',       // start clean in UI
                                unit: f.unit || lastUnits[f.key] || ''
                            }));
                            setDataFields(newFields);
                            loadedFromCache = true;
                        } else {
                            // Stale cache — clear it and re-fetch from Supabase
                            localStorage.removeItem(`phdnexus_last_params_${newType}`);
                        }
                    } catch (e) {
                        console.error('Error loading cached default fields structure', e);
                    }
                }
            }

            if (!loadedFromCache) {
                // ── Supabase cross-platform fallback ──
                // Fetch the last saved record of this type from the DB so that
                // parameters added on Desktop show up in the Web app too.
                getLastCharacterizationParamsAction(groupId, newType).then(res => {
                    if (res.data) {
                        const data = res.data;
                        const order: string[] = Array.isArray(data.__order__) ? data.__order__ : [];
                        const systemKeys = new Set(['equipment', 'notes', '__order__', 'file_origin', 'drive_file_link',
                            'local_h5_paths', 'original_files', 'local_h5_path', 'original_file',
                            'raman_spectrum_file_id', '__bulk_id__', 'file_metadata', 'attached_images', 'attached_image']);

                        const separateUnit = (val: string): { v: string; u: string } => {
                            const match = val.match(/^([\d\.]+)\s*([a-zA-Z%μµ°Ω]+)$/);
                            if (match) return { v: match[1], u: match[2] };
                            if (val.match(/^x\d+$/)) return { v: val.replace('x', ''), u: 'x' };
                            return { v: val, u: '' };
                        };

                        const seen = new Set<string>();
                        // cacheFields: with real values → stored in localStorage for Auto-Fill
                        // displayFields: empty values → shown in UI so user starts fresh
                        const cacheFields: { key: string; value: string; unit: string }[] = [];
                        const displayFields: { key: string; value: string; unit: string }[] = [];

                        // 1. Ordered keys first
                        order.forEach(k => {
                            if (!systemKeys.has(k) && data[k] !== undefined && !seen.has(k)) {
                                const { v, u } = separateUnit(String(data[k]));
                                const unit = lastUnits[k] || u;
                                cacheFields.push({ key: k, value: v, unit });
                                displayFields.push({ key: k, value: '', unit });
                                seen.add(k);
                            }
                        });

                        // 2. Any remaining non-system keys
                        Object.keys(data).forEach(k => {
                            if (!systemKeys.has(k) && !seen.has(k)) {
                                const { v, u } = separateUnit(String(data[k]));
                                const unit = lastUnits[k] || u;
                                cacheFields.push({ key: k, value: v, unit });
                                displayFields.push({ key: k, value: '', unit });
                                seen.add(k);
                            }
                        });

                        if (displayFields.length > 0) {
                            setDataFields(displayFields);
                            // Persist WITH real values so Auto-Fill works cross-platform
                            if (typeof window !== 'undefined') {
                                localStorage.setItem(`phdnexus_last_params_${newType}`,
                                    JSON.stringify(cacheFields));
                            }
                            return; // Skip hardcoded defaults below
                        }
                    }

                    // ── Hardcoded fallback when no DB record exists yet ──
                    const defaults: Record<string, string[]> = {
                        'Raman': ['Analyte', 'Laser', 'Power', 'Objective', 'Acquisition Time', 'Measurement Type']
                    };
                    const defaultKeys = defaults[newType] || [];
                    const savedOrder = parameterOrder[newType];
                    let finalKeys = [...defaultKeys];
                    if (savedOrder && savedOrder.length > 0) {
                        const uniqueSaved = Array.from(new Set(savedOrder));
                        const missingStandard = defaultKeys.filter(k => !uniqueSaved.includes(k));
                        finalKeys = [...uniqueSaved, ...missingStandard];
                    }
                    const newFields = finalKeys.map(key => ({ key, value: '', unit: lastUnits[key] || '' }));
                    setDataFields(newFields.length > 0 ? newFields : [{ key: '', value: '', unit: '' }]);
                });
            }
        }
    };

    const handleFieldChange = (index: number, field: 'key' | 'value' | 'unit', val: string) => {
        const newFields = [...dataFields];
        newFields[index][field] = val;
        setDataFields(newFields);

        // Unit history update on change/blur is better, but let's do it here for responsiveness
        // We only commit to history on save or blur usually, but keeping text correct is key.

        // If updating key, try to auto-fill unit from history
        if (field === 'key' && val && lastUnits[val] && !newFields[index].unit) {
            newFields[index].unit = lastUnits[val];
        }
    };

    const handleAddField = () => {
        setDataFields([...dataFields, { key: '', value: '', unit: '' }]);
    };

    const handleRemoveField = (index: number) => {
        if (dataFields.length === 1) {
            setDataFields([{ key: '', value: '', unit: '' }]);
        } else {
            setDataFields(dataFields.filter((_, i) => i !== index));
        }
    };

    const handleMoveField = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === dataFields.length - 1) return;

        const newFields = [...dataFields];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
        setDataFields(newFields);

        // Persist Global Order Preference
        const orderToSave = newFields.map(f => f.key.trim()).filter(Boolean);
        if (type && orderToSave.length > 0) {
            setParameterOrder(prev => ({
                ...prev,
                [type]: orderToSave
            }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Prime Google Auth early to preserve user interaction context for popups
        if (type === 'Raman' && scriptsLoaded) {
            import('@/lib/google/auth').then(({ ensureAuth }) => ensureAuth().catch(() => {}));
        }

        const finalType = isAddingCustomType ? customTypeName.trim() : type;
        if (!finalType) {
            toast.error('Please specify a technique name');
            setIsSubmitting(false);
            return;
        }

        const cleanData: Record<string, any> = {};
        const orderedKeys: string[] = [];

        dataFields.forEach(field => {
            if (field.key.trim()) {
                const k = field.key.trim();
                const v = field.value.trim();
                const u = field.unit.trim();

                if (v || u) { // Only save if there is a value or unit (or should we strictly require value?)
                    cleanData[k] = u ? `${v} ${u}` : v;
                    orderedKeys.push(k);

                    // Update History
                    if (u) {
                        setLastUnits(prev => ({ ...prev, [k]: u }));
                        setParameterUnits(prev => {
                            const existing = prev[k] || [];
                            return existing.includes(u) ? prev : { ...prev, [k]: [...existing, u] };
                        });
                    }
                }
            }
        });

        if (notes.trim()) cleanData['notes'] = notes.trim();
        if (equipment.trim()) {
            cleanData['equipment'] = equipment.trim();
            if (typeof window !== 'undefined') {
                localStorage.setItem(`phdnexus_last_equipment_${type}`, equipment.trim());
            }
        }
        if (fileOrigin.trim()) cleanData['file_origin'] = fileOrigin.trim();
        if (driveFileLink.trim()) cleanData['drive_file_link'] = driveFileLink.trim();
        // Desktop: store the local HDF5 paths
        if (h5RelativePaths.length > 0) cleanData['local_h5_paths'] = h5RelativePaths;
        if (localFilePaths.length > 0) cleanData['original_files'] = localFilePaths;
        if (Object.keys(fileMetadata).length > 0) cleanData['file_metadata'] = fileMetadata;

        // Raman Spectrum Logic
        if (type === 'Raman') {
            try {
                let spectrumData: {x: number, y: number}[] = [];

                if (isDesktop && h5RelativePaths.length > 0) {
                    const currentVaultRoot = localStorage.getItem('phdnexus_vault_root');
                    if (currentVaultRoot) {
                        const repRes = await fetchRepresentativeSpectrum(currentVaultRoot, h5RelativePaths);
                        if (repRes.success && repRes.data && repRes.data.length > 0) {
                            spectrumData = repRes.data;
                        }
                    }
                } else if (ramanSpectrum.trim()) {
                    const parseXYData = (text: string) => {
                        return text.trim().split('\n').map(line => {
                            const parts = line.trim().split(/\s+/);
                            if (parts.length >= 2) {
                                const x = parseFloat(parts[0]);
                                const y = parseFloat(parts[1]);
                                if (!isNaN(x) && !isNaN(y)) return { x, y };
                            }
                            return null;
                        }).filter(Boolean) as {x: number, y: number}[];
                    };
                    spectrumData = parseXYData(ramanSpectrum);
                }

                if (spectrumData.length > 0) {
                    const payload = {
                        sample_id: sample.id,
                        sample_code: sample.sample_code,
                        sample_name: sample.name,
                        date: performedAt,
                        equipment: equipment,
                        parameters: cleanData,
                        data: spectrumData
                    };
                    const jsonString = JSON.stringify(payload, null, 2);
                    const docName = [
                        sample.sample_code || sample.display_id,
                        sample.name || '',
                        'Spectrum'
                    ].filter(Boolean).join('_');

                    const blob = new Blob([jsonString], { type: 'application/json' });
                    const file = new File([blob], `${docName}.json`, { type: 'application/json' });

                    // OPTIONAL: Try Google Drive Upload. Do not block if it fails or hangs on Desktop.
                    try {
                        const { ensureAuth } = await import('@/lib/google/auth');
                        // 3-second timeout for Auth (Tauri blocks popups, causing it to hang)
                        const authPromise = ensureAuth();
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 3000));
                        await Promise.race([authPromise, timeoutPromise]);

                        const targetFolderId = driveSettings?.sampleFolderId || driveSettings?.folderId;
                        const driveFile = await uploadFileToDrive(file, targetFolderId);

                        if (driveFile && driveFile.id) {
                            cleanData['raman_spectrum_file_id'] = driveFile.id;
                        }
                    } catch (driveErr: any) {
                        console.warn("Drive upload skipped:", driveErr);
                        // We do NOT abort. We just proceed saving locally/Supabase.
                        toast.info("Saved data, but Google Drive sync was skipped.");
                    }
                }
             } catch (err: any) {
                console.warn('Warning handling Raman spectrum (Engine may be offline):', err.message);
                toast.error('Could not load representative spectrum, but saved other data.');
            }
        }

        // Desktop: save pasted base64 images physically inside the sample folder
        const finalAttachedImages: string[] = [];
        if (isDesktop && pastedImages.length > 0) {
            const currentVaultRoot = typeof window !== 'undefined' ? localStorage.getItem('phdnexus_vault_root') : null;
            if (currentVaultRoot) {
                for (const img of pastedImages) {
                    if (img.relativePath) {
                        // Image already exists in vault, keep it
                        finalAttachedImages.push(img.relativePath);
                    } else if (img.base64) {
                        try {
                            const saveRes = await savePastedImage({
                                image_base64: img.base64,
                                vault_root: currentVaultRoot,
                                filename: img.name,
                                metadata: {
                                    group_id: groupId,
                                    sample_id: sample.id,
                                    sample_code: sample.sample_code,
                                    sample_name: sample.name,
                                    logbook_name: logbookName,
                                    technique: finalType
                                }
                            });
                            if (saveRes.success && saveRes.relative_path) {
                                finalAttachedImages.push(saveRes.relative_path);
                            }
                        } catch (err: any) {
                            console.error("Failed to save image", img.name, err);
                            toast.error(`Failed to save image ${img.name}: ${err.message}`);
                        }
                    }
                }
            }
        }

        if (finalAttachedImages.length > 0) {
            cleanData['attached_images'] = finalAttachedImages;
        }


        // Critical: Save the order
        cleanData['__order__'] = orderedKeys;

        // Also update global preference if we have valid keys
        if (orderedKeys.length > 0) {
            setParameterOrder(prev => ({ ...prev, [type]: orderedKeys }));
        }

        // Desktop: physical file renaming on parameter edit
        if (isDesktop && initialData?.id && h5RelativePaths.length > 0) {
            const vaultRoot = typeof window !== 'undefined' ? localStorage.getItem('phdnexus_vault_root') : null;
            if (vaultRoot) {
                try {
                    const renameRes = await renameVaultFiles({
                        vault_root: vaultRoot,
                        h5_relative_paths: h5RelativePaths,
                        metadata: {
                            ...cleanData,
                            sample_code: sample.sample_code,
                            sample_name: sample.name,
                            logbook_name: logbookName,
                            technique: finalType
                        }
                    });

                    if (renameRes.success && renameRes.renamed_paths) {
                        const updatedPaths = h5RelativePaths.map(p => renameRes.renamed_paths[p] || p);
                        
                        // Update cleanData with the new renamed paths
                        cleanData['local_h5_paths'] = updatedPaths;
                        if (cleanData['local_h5_path']) {
                            cleanData['local_h5_path'] = updatedPaths[0] || '';
                        }
                        if (cleanData['original_file']) {
                            cleanData['original_file'] = updatedPaths[0] || '';
                        }
                        
                        // Update state so the modal stays in sync
                        setH5RelativePaths(updatedPaths);
                        toast.success("Local files renamed successfully!");
                    }
                } catch (renameErr: any) {
                    console.error("Failed to rename local files:", renameErr);
                    toast.error(`Could not rename physical files on disk: ${renameErr.message}`);
                }
            }
        }

        let res;
        if (initialData?.id) {
            res = await updateCharacterizationAction({
                id: initialData.id,
                group_id: groupId,
                type: finalType,
                data: cleanData,
                performed_at: performedAt ? new Date(performedAt).toISOString() : undefined,
                updateBatch: updateBatch
            });
        } else {
            res = await createCharacterizationAction({
                group_id: groupId,
                sample_id: sample.id,
                type: finalType,
                data: cleanData,
                performed_at: performedAt ? new Date(performedAt).toISOString() : undefined
            });
        }

        setIsSubmitting(false);

        if (res.error) {
            toast.error(res.error);
        } else {
            // Save current parameter keys, units and values to localStorage for next autofill & load structure
            if (typeof window !== 'undefined') {
                const paramsToSave = dataFields
                    .filter(f => f.key.trim() !== '' && f.key.trim() !== 'attached_images' && f.key.trim() !== 'attached_image')
                    .map(f => ({
                        key: f.key.trim(),
                        value: f.value.trim(),
                        unit: f.unit.trim()
                    }));
                localStorage.setItem(`phdnexus_last_params_${finalType}`, JSON.stringify(paramsToSave));
            }
            toast.success(initialData?.id ? 'Updated' : 'Created');
            onClose();
        }
    };

    // Google Doc Generation Helper
    const handleGenerateDoc = async () => {
        setIsGeneratingDoc(true);
        try {
            const { ensureAuth } = await import('@/lib/google/auth');
            await ensureAuth();
            const gapi = (window as any).gapi;

            // Build doc name: Code_Name_Type_Conditions
            const conditionParts = dataFields
                .filter(f => f.key.trim() && f.value.trim())
                .map(f => f.unit ? `${f.value}${f.unit}` : f.value);
            const conditionStr = conditionParts.join('-');
            const docName = [
                sample.sample_code || sample.display_id,
                sample.name || '',
                type,
                conditionStr
            ].filter(Boolean).join('_');

            // Create the Google Doc
            const fileMeta: any = {
                name: docName,
                mimeType: 'application/vnd.google-apps.document'
            };
            // Use sampleFolderId if configured, otherwise fall back to root folderId
            const targetFolderId = driveSettings?.sampleFolderId || driveSettings?.folderId;
            if (targetFolderId) {
                fileMeta.parents = [targetFolderId];
            }
            const createRes = await gapi.client.drive.files.create({
                resource: fileMeta,
                fields: 'id, webViewLink'
            });
            const fileId = createRes.result.id;

            // Build rich document content
            const text = `CHARACTERIZATION REPORT\n${'='.repeat(40)}\n\n` +
                `Sample: ${sample.name}\nCode: ${sample.sample_code || '-'}\nType: ${type}\nEquipment: ${equipment}\n\n` +
                `PARAMETERS:\n${dataFields.map(f => f.key ? `- ${f.key}: ${f.value} ${f.unit}` : '').join('\n')}\n` +
                (notes ? `\nNOTES:\n${notes}\n` : '') +
                (fileOrigin ? `\nFILE ORIGIN: ${fileOrigin}` : '');

            await gapi.client.docs.documents.batchUpdate({
                documentId: fileId,
                resource: {
                    requests: [{
                        insertText: { location: { index: 1 }, text }
                    }]
                }
            });

            const link = createRes.result.webViewLink || `https://docs.google.com/document/d/${fileId}/edit`;
            setDriveFileLink(link);
            toast.success('Doc created');
            window.open(link, '_blank');
        } catch (err: any) {
            console.error('Doc Gen Error', err);
            toast.error(err.message || 'Error generating doc');
        } finally {
            setIsGeneratingDoc(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-purple-100 text-purple-600 rounded-lg">
                            <Microscope size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 leading-tight">
                                {initialData?.id ? 'Edit Characterization' : 'New Characterization'}
                            </h2>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                <span className="font-bold text-slate-800">{sample.sample_code || sample.display_id}</span>
                                <span className="text-slate-300">|</span>
                                <span className="font-medium text-slate-700">{sample.name}</span>
                                <span className="text-slate-300">•</span>
                                <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-bold uppercase">{type}</span>
                                {sample.description && (
                                    <>
                                        <span className="text-slate-300">•</span>
                                        <span className="italic text-slate-400 truncate max-w-[300px]" title={sample.description}>
                                            "{sample.description}"
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* Left Column: Metadata */}
                        <div className="lg:col-span-4 space-y-6">

                            {/* Technique Selection */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Technique</label>
                                <div className="space-y-3">
                                            <div className="relative">
                                                <select
                                                    value={isAddingCustomType ? ADD_NEW_OPTION : type}
                                                    onChange={e => handleTypeSelection(e.target.value)}
                                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none appearance-none font-medium text-slate-700 shadow-sm"
                                                >
                                                    {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                    <option value="Other">Other (Generic)</option>
                                                    <option value={ADD_NEW_OPTION} className="text-purple-600 font-bold">+ Add New Technique...</option>
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                                            </div>

                                            {isAddingCustomType && (
                                                <div className="relative animate-in slide-in-from-top-2 duration-200">
                                                    <input
                                                        autoFocus
                                                        value={customTypeName}
                                                        onChange={e => setCustomTypeName(e.target.value)}
                                                        placeholder="New Technique Name (e.g. XRD)"
                                                        className="w-full text-sm border border-purple-200 rounded-lg px-3 py-2.5 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all placeholder:text-slate-400 font-bold text-purple-700"
                                                    />
                                                </div>
                                            )}

                                    <div className="relative">
                                        <input
                                            value={equipment}
                                            onChange={e => setEquipment(e.target.value)}
                                            placeholder="Equipment Name (e.g. Horiba)"
                                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all placeholder:text-slate-400"
                                        />
                                    </div>

                                    <div className="space-y-1.5 pt-2">
                                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Experiment Date</label>
                                        <input
                                            type="date"
                                            value={performedAt}
                                            onChange={e => setPerformedAt(e.target.value)}
                                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none font-medium text-slate-700"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-slate-100" />

                            {/* External Links */}
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 justify-between mb-2">
                                        <div className="flex items-center gap-1.5"><FolderOpen size={13} /> Raw Data & Files</div>
                                        {isDesktop && fileOrigin && (
                                            <button 
                                                type="button" 
                                                onClick={handleOpenFolder} 
                                                className="text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all"
                                                title="Open in File Explorer"
                                            >
                                                Open Local Folder
                                            </button>
                                        )}
                                    </label>
                                    
                                    {(isDesktop && type !== 'Raman' && type !== 'SERS') ? (
                                        <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleSelectRawFile}
                                                    className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium border border-slate-300 border-dashed rounded-md px-2 py-1.5 outline-none hover:border-purple-400 bg-white hover:bg-purple-50 hover:text-purple-600 transition-colors text-slate-600 shadow-sm"
                                                >
                                                    <FolderOpen size={12} /> Select Files
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleDesktopFileIngest}
                                                    disabled={ingestStatus === 'loading' || !engineOnline || localFilePaths.length === 0}
                                                    className={cn(
                                                        "px-3 py-1.5 text-[11px] font-bold rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap",
                                                        engineOnline && localFilePaths.length > 0
                                                            ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                                                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                                    )}
                                                >
                                                    {ingestStatus === 'loading' ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : 'Save to Vault'}
                                                </button>
                                            </div>

                                            {localFilePaths.length > 0 && (
                                                <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                                                    {localFilePaths.map((fp, i) => {
                                                        const isIngested = !!h5RelativePaths[i];
                                                        const filename = fp.split(/[\\/]/).pop();
                                                        return (
                                                            <div key={i} className="flex justify-between items-center px-2 py-1 bg-white border border-slate-200 rounded text-[10px] group">
                                                                <div className="flex items-center gap-1.5 overflow-hidden">
                                                                    {isIngested ? (
                                                                        <CheckCircle2 size={10} className="text-emerald-500 flex-shrink-0" />
                                                                    ) : (
                                                                        <div className="w-2.5 h-2.5 rounded-full border border-slate-200 border-t-purple-400 animate-spin flex-shrink-0" />
                                                                    )}
                                                                    <button 
                                                                        type="button" 
                                                                        onClick={() => handleOpenFileDirectly(fp, h5RelativePaths[i])}
                                                                        className="font-mono text-slate-600 hover:text-blue-600 hover:underline truncate text-left" 
                                                                        title="Open file"
                                                                    >
                                                                        {filename}
                                                                    </button>
                                                                </div>
                                                                <button type="button" onClick={() => handleRemoveIngestedFile(i)} className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 rounded transition-all ml-1 flex-shrink-0">
                                                                    <X size={10} />
                                                                </button>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <input
                                            value={fileOrigin}
                                            onChange={e => setFileOrigin(e.target.value)}
                                            placeholder="Path to raw files..."
                                            className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition-all text-slate-600 bg-slate-50/50"
                                        />
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <FileText size={13} /> Documentation
                                    </label>

                                    {driveFileLink ? (
                                        <div className="flex items-center gap-2 p-1 border border-blue-100 bg-blue-50 rounded-lg">
                                            <a href={driveFileLink} target="_blank" className="flex-1 flex items-center gap-2 px-2 py-1.5 text-xs text-blue-700 hover:underline truncate">
                                                <ExternalLink size={12} />
                                                <span className="truncate">Open Google Doc</span>
                                            </a>
                                            <button onClick={() => setDriveFileLink('')} className="p-1.5 hover:bg-white rounded text-blue-400 hover:text-red-500 transition-colors">
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleGenerateDoc}
                                            disabled={!scriptsLoaded || isGeneratingDoc}
                                            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {isGeneratingDoc ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                            Generate Report
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Parameters & Notes */}
                        <div className="lg:col-span-8 flex flex-col h-full space-y-6">

                            {/* Parameters Grid */}
                            <div className="flex-1 flex flex-col min-h-[300px]">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            <List size={16} className="text-blue-500" />
                                            Data Points
                                        </h3>
                                        <p className="text-xs text-slate-400">Define experimental conditions and results</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                let filledFromCache = false;

                                                // 1. Try localStorage first (fastest)
                                                if (typeof window !== 'undefined') {
                                                    const lastParamsJson = localStorage.getItem(`phdnexus_last_params_${type}`);
                                                    if (lastParamsJson) {
                                                        try {
                                                            const cachedFields = JSON.parse(lastParamsJson);
                                                            if (Array.isArray(cachedFields) && cachedFields.length > 0) {
                                                                setDataFields(cachedFields);
                                                                filledFromCache = true;
                                                            }
                                                        } catch (err) {
                                                            console.error('Error parsing cached autofill params', err);
                                                        }
                                                    }
                                                }

                                                // 2. Cross-platform fallback: Supabase last record
                                                if (!filledFromCache) {
                                                    const res = await getLastCharacterizationParamsAction(groupId, type);
                                                    if (res.data) {
                                                        const data = res.data;
                                                        const order: string[] = Array.isArray(data.__order__) ? data.__order__ : [];
                                                        const systemKeys = new Set(['equipment', 'notes', '__order__', 'file_origin',
                                                            'drive_file_link', 'local_h5_paths', 'original_files', 'local_h5_path',
                                                            'original_file', 'raman_spectrum_file_id', '__bulk_id__', 'file_metadata',
                                                            'attached_images', 'attached_image']);
                                                        const separateUnit = (val: string): { v: string; u: string } => {
                                                            const m = val.match(/^([\d\.]+)\s*([a-zA-Z%μµ°Ω]+)$/);
                                                            return m ? { v: m[1], u: m[2] } : { v: val, u: '' };
                                                        };
                                                        const seen = new Set<string>();
                                                        const fields: { key: string; value: string; unit: string }[] = [];
                                                        order.forEach(k => {
                                                            if (!systemKeys.has(k) && data[k] !== undefined && !seen.has(k)) {
                                                                const { v, u } = separateUnit(String(data[k]));
                                                                fields.push({ key: k, value: v, unit: lastUnits[k] || u });
                                                                seen.add(k);
                                                            }
                                                        });
                                                        Object.keys(data).forEach(k => {
                                                            if (!systemKeys.has(k) && !seen.has(k)) {
                                                                const { v, u } = separateUnit(String(data[k]));
                                                                fields.push({ key: k, value: v, unit: lastUnits[k] || u });
                                                                seen.add(k);
                                                            }
                                                        });
                                                        if (fields.length > 0) {
                                                            setDataFields(fields);
                                                            filledFromCache = true;
                                                            // Warm localStorage for next time
                                                            if (typeof window !== 'undefined') {
                                                                localStorage.setItem(`phdnexus_last_params_${type}`,
                                                                    JSON.stringify(fields.map(f => ({ key: f.key, value: f.value, unit: f.unit }))));
                                                            }
                                                        }
                                                    }
                                                }

                                                // 3. Hardcoded defaults as last resort
                                                if (!filledFromCache) {
                                                    if (type === 'Raman') {
                                                        setDataFields([
                                                            { key: 'Analyte', value: 'R6G', unit: '10-6' },
                                                            { key: 'Laser', value: '633', unit: 'nm' },
                                                            { key: 'Power', value: '70', unit: 'µW' },
                                                            { key: 'Objective', value: '50', unit: 'x' },
                                                            { key: 'Acquisition Time', value: '1', unit: 's' },
                                                            { key: 'Accumulations', value: '10', unit: '' }
                                                        ]);
                                                    } else if (type === 'AFM') {
                                                        setDataFields([
                                                            { key: 'Scan Size', value: '5', unit: 'µm' },
                                                            { key: 'Scan Rate', value: '1', unit: 'Hz' },
                                                            { key: 'Tip Type', value: 'Silicon', unit: '' }
                                                        ]);
                                                    } else {
                                                        toast.info('No auto-fill template available for this technique yet.');
                                                    }
                                                }

                                                // Auto-fill equipment if previously saved
                                                if (typeof window !== 'undefined') {
                                                    const lastEq = localStorage.getItem(`phdnexus_last_equipment_${type}`);
                                                    if (lastEq && !equipment) setEquipment(lastEq);
                                                }
                                                toast.success('Fields auto-filled!');
                                            }}
                                            className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-md font-medium hover:bg-emerald-100 transition-colors"
                                            title="Auto-fill based on Logbook/Technique"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            Auto-Fill
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddField}
                                            className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md font-medium hover:bg-blue-100 transition-colors"
                                        >
                                            <Plus size={14} /> Add Parameter
                                        </button>
                                    </div>
                                </div>

                                <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm flex flex-col">
                                    {/* Table Header */}
                                    <div className="grid grid-cols-12 bg-slate-50/80 border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider gap-4">
                                        <div className="col-span-1 text-center">#</div>
                                        <div className="col-span-4">Parameter Name</div>
                                        <div className="col-span-4">Value</div>
                                        <div className="col-span-2">Unit</div>
                                        <div className="col-span-1"></div>
                                    </div>

                                    {/* Table Rows */}
                                    <div className="divide-y divide-slate-100 overflow-y-auto max-h-[350px]">
                                        {dataFields.map((field, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-4 items-center px-4 py-2 hover:bg-slate-50/50 group transition-colors">

                                                {/* Reorder Controls */}
                                                <div className="col-span-1 flex flex-col items-center justify-center gap-0.5">
                                                    <button
                                                        onClick={() => handleMoveField(idx, 'up')}
                                                        className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-20"
                                                        disabled={idx === 0}
                                                    >
                                                        <ChevronUp size={12} />
                                                    </button>
                                                    <GripVertical size={12} className="text-slate-300" />
                                                    <button
                                                        onClick={() => handleMoveField(idx, 'down')}
                                                        className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-20"
                                                        disabled={idx === dataFields.length - 1}
                                                    >
                                                        <ChevronDown size={12} />
                                                    </button>
                                                </div>

                                                <div className="col-span-4">
                                                    <input
                                                        value={field.key}
                                                        onChange={e => handleFieldChange(idx, 'key', e.target.value)}
                                                        placeholder="Parameter"
                                                        className="w-full text-sm font-medium bg-transparent border-none p-0 focus:ring-0 placeholder:text-slate-300 text-slate-800"
                                                    />
                                                </div>

                                                <div className="col-span-4">
                                                    <input
                                                        value={field.value}
                                                        onChange={e => handleFieldChange(idx, 'value', e.target.value)}
                                                        placeholder="Value"
                                                        className="w-full text-sm font-mono bg-slate-50 border border-transparent focus:bg-white focus:border-blue-200 rounded px-2 py-1 focus:ring-0 text-slate-700 placeholder:text-slate-300 transition-colors"
                                                    />
                                                </div>

                                                <div className="col-span-2 relative">
                                                    <input
                                                        list={`units-list-${idx}`}
                                                        value={field.unit}
                                                        onChange={e => handleFieldChange(idx, 'unit', e.target.value)}
                                                        placeholder="Unit"
                                                        className="w-full text-xs bg-transparent border-b border-transparent focus:border-purple-300 p-1 focus:ring-0 text-slate-500 placeholder:text-slate-300 text-right"
                                                    />
                                                    <datalist id={`units-list-${idx}`}>
                                                        {field.key && parameterUnits[field.key] ?
                                                            parameterUnits[field.key].map(u => <option key={u} value={u} />) :
                                                            ['nm', 'µW', 'mW', 'x', 's', 'min', '%', 'Hz', 'V'].map(u => <option key={u} value={u} />)
                                                        }
                                                    </datalist>
                                                </div>

                                                <div className="col-span-1 flex justify-end">
                                                    <button
                                                        onClick={() => handleRemoveField(idx)}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Empty State / Footer */}
                                    {dataFields.length === 0 && (
                                        <div className="p-8 text-center text-slate-400 bg-slate-50">
                                            No parameters defined yet.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Notes Area */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes & Observations</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter additional details..." className="w-full h-24 text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none bg-slate-50/30" />
                            </div>

                            {hasBulkId && (
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="updateBatch"
                                        checked={updateBatch}
                                        onChange={e => setUpdateBatch(e.target.checked)}
                                        className="h-4 w-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500"
                                    />
                                    <label htmlFor="updateBatch" className="text-sm font-medium text-orange-800 cursor-pointer">
                                        Update all samples in this batch <span className="text-xs font-normal opacity-70">(Apply changes to grouped records)</span>
                                    </label>
                                </div>
                            )}

                            {/* Raman / SERS Spectrum Section */}
                            {(type === 'Raman' || type === 'SERS') && (
                                <div className="p-5 bg-purple-50/50 border border-purple-100 rounded-xl space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg">
                                            <Activity size={16} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-800">{type} Spectrum Data</h4>
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                                                {isDesktop ? 'Local file ingestion (Desktop)' : 'Paste XY values (Web)'}
                                            </p>
                                        </div>
                                    </div>

                                {isDesktop ? (
                                        /* ─── DESKTOP: File Ingestion UI ─── */
                                        <div className="space-y-3">
                                            {/* Engine status */}
                                            <div className={cn(
                                                "flex items-center gap-2 text-[10px] font-semibold px-3 py-1.5 rounded-lg",
                                                engineOnline ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                                            )}>
                                                {engineOnline
                                                    ? <><CheckCircle2 size={12} /> Python Engine Online</>  
                                                    : <><AlertCircle size={12} /> Python Engine Offline — run <code className="mx-1 font-mono bg-amber-100 px-1 rounded">python start.py</code> in python-engine/</>}
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Raw Data File Path (.txt, .mat)</label>
                                                <p className="text-[10px] text-slate-400 mb-2">The file will be processed and copied to your global Data Vault Root (configured in Settings).</p>
                                                <div className="space-y-2">
                                                    {localFilePaths.length > 0 && (
                                                        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50/50 shadow-inner">
                                                            {localFilePaths.map((fp, i) => {
                                                                const isIngested = !!h5RelativePaths[i];
                                                                const filename = fp.split(/[\\/]/).pop();
                                                                return (
                                                                    <div key={i} className="flex flex-col bg-white border border-slate-100 rounded-md shadow-sm group overflow-hidden">
                                                                        <div className="flex justify-between items-center px-2 py-1.5 ">
                                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                                {isIngested ? (
                                                                                    <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                                                                                ) : (
                                                                                    <div className="w-3 h-3 rounded-full border-2 border-slate-200 border-t-purple-400 animate-spin flex-shrink-0" />
                                                                                )}
                                                                                <button 
                                                                                    type="button" 
                                                                                    onClick={() => handleOpenFileDirectly(fp, h5RelativePaths[i])}
                                                                                    className="text-xs font-mono text-slate-600 hover:text-blue-600 hover:underline truncate text-left" 
                                                                                    title="Click to open file directly"
                                                                                >
                                                                                    {filename}
                                                                                </button>
                                                                            </div>
                                                                            <button type="button" onClick={() => handleRemoveIngestedFile(i)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all ml-2 flex-shrink-0">
                                                                                <X size={12} />
                                                                            </button>
                                                                        </div>
                                                                        
                                                                        {isIngested && fileMetadata[h5RelativePaths[i]] && (
                                                                            <div className="px-2 pb-1.5 flex gap-3 border-t border-slate-50 pt-1 bg-slate-50/30">
                                                                                {fileMetadata[h5RelativePaths[i]].range && (
                                                                                    <div className="flex flex-col">
                                                                                        <span className="text-[8px] uppercase font-bold text-slate-400">Range</span>
                                                                                        <span className="text-[9px] font-medium text-slate-500">
                                                                                            {fileMetadata[h5RelativePaths[i]].range![0].toFixed(1)}-{fileMetadata[h5RelativePaths[i]].range![1].toFixed(1)} cm⁻¹
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                                {fileMetadata[h5RelativePaths[i]].points && (
                                                                                    <div className="flex flex-col">
                                                                                        <span className="text-[8px] uppercase font-bold text-slate-400">Pts</span>
                                                                                        <span className="text-[9px] font-medium text-slate-500">{fileMetadata[h5RelativePaths[i]].points}</span>
                                                                                    </div>
                                                                                )}
                                                                                {fileMetadata[h5RelativePaths[i]].spectra && (
                                                                                    <div className="flex flex-col">
                                                                                        <span className="text-[8px] uppercase font-bold text-slate-400">Matrix</span>
                                                                                        <span className="text-[9px] font-medium text-slate-500">
                                                                                            {fileMetadata[h5RelativePaths[i]].spectra! === 1 ? '1x1' : 
                                                                                             Number.isInteger(Math.sqrt(fileMetadata[h5RelativePaths[i]].spectra!)) ? 
                                                                                             `${Math.sqrt(fileMetadata[h5RelativePaths[i]].spectra!)}x${Math.sqrt(fileMetadata[h5RelativePaths[i]].spectra!)}` : 
                                                                                             `${fileMetadata[h5RelativePaths[i]].spectra} spec`}
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleSelectRawFile}
                                                        className="flex-1 flex items-center justify-center gap-2 text-xs font-medium border border-slate-200 border-dashed rounded-lg px-3 py-2 outline-none hover:border-purple-400 bg-white hover:bg-purple-50 hover:text-purple-600 transition-colors text-slate-500"
                                                    >
                                                        <FolderOpen size={14} /> Select Additional Files...
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleDesktopFileIngest}
                                                        disabled={ingestStatus === 'loading' || !engineOnline}
                                                        className={cn(
                                                            "px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap",
                                                            engineOnline
                                                                ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                                                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                                                        )}
                                                    >
                                                        {ingestStatus === 'loading'
                                                            ? <><Loader2 size={12} className="animate-spin" /> Processing...</>
                                                            : <><Activity size={12} /> Ingest File</>}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Result: Preview + Path */}
                                            {ingestStatus === 'success' && spectrumPreviewB64 && (
                                                <div className="space-y-2">
                                                    <img
                                                        src={`data:image/png;base64,${spectrumPreviewB64}`}
                                                        alt="Spectrum preview"
                                                        className="w-full rounded-lg border border-purple-200 shadow-sm"
                                                    />
                                                </div>
                                            )}
                                            
                                            {ingestStatus === 'error' && (
                                                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                                    <AlertCircle size={14} className="text-red-500" />
                                                    <span className="text-[10px] text-red-600">Processing failed. Check that the file path is correct and the engine is running.</span>
                                                </div>
                                            )}

                                            {/* Attached Images/Bitmaps Paste Zone */}
                                            <div className="mt-4 pt-4 border-t border-purple-100/50 space-y-3">
                                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Attached Microscope Images & Bitmaps</label>
                                                <div
                                                    onPaste={handlePaste}
                                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                                    onDragLeave={() => setIsDragging(false)}
                                                    onDrop={handleDrop}
                                                    onClick={triggerFileSelect}
                                                    className={cn(
                                                        "border border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 bg-white",
                                                        isDragging 
                                                            ? "border-purple-500 bg-purple-50/30" 
                                                            : "border-slate-200 hover:border-purple-300 hover:bg-slate-50/30"
                                                    )}
                                                >
                                                    <Clipboard className={cn("w-5 h-5 text-slate-400", isDragging && "text-purple-500 animate-bounce")} />
                                                    <p className="text-xs font-semibold text-slate-700 text-center">
                                                        Paste Image or Screenshot (Ctrl+V)
                                                    </p>
                                                    <p className="text-[9px] text-slate-400 text-center">
                                                        Or drag & drop, or click to browse
                                                    </p>
                                                    <input 
                                                        ref={imageInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        multiple
                                                        onChange={handleImageFileChange}
                                                        className="hidden"
                                                    />
                                                </div>
                                                {renderAttachedImagesList()}
                                            </div>
                                        </div>

                                    ) : (
                                        /* ─── WEB: Paste XY textarea (unchanged) ─── */
                                        <div className="space-y-2">
                                            <textarea
                                                value={ramanSpectrum}
                                                onChange={e => setRamanSpectrum(e.target.value)}
                                                placeholder={"369.28  744.15\n372.51  740.00\n..."}
                                                className="w-full h-48 text-[11px] font-mono border border-purple-200 rounded-lg px-3 py-2.5 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 resize-none bg-white shadow-inner"
                                            />
                                            <p className="text-[10px] text-slate-400 italic">
                                                Note: Data will be saved as a JSON file in Google Drive and linked here.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-lg shadow-purple-900/10 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {initialData ? 'Update Record' : 'Save Record'}
                    </button>
                </div>
            </div>
        </div>
    );
}
