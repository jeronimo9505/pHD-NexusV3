import { SampleFieldConfig, SampleNomenclature } from "./types";
import { formatDate as libFormatDate } from "@/lib/utils";

/**
 * Generates a Smart ID based on the selected attributes and nomenclature definitions.
 * It strictly concatenates the CODES of fields with type 'nomenclature',
 * ordered by the field's 'order' property.
 */
export function generateSmartId(
    attributes: Record<string, any>,
    fields: SampleFieldConfig[],
    nomenclatures: SampleNomenclature[]
): string {
    // 1. Filter fields that contribute shorter codes (nomenclature type)
    // You might want to include 'select' types too if they have short codes, 
    // but for now let's stick to 'nomenclature' as per requirements.
    const contributingFields = fields
        .filter(f => f.type === 'nomenclature')
        .sort((a, b) => a.order - b.order);

    const parts: string[] = [];

    for (const field of contributingFields) {
        const value = attributes[field.name];
        if (value) {
            // Find the nomenclature item that matches this value (which is likely the item ID or Name)
            // But wait, the value stored in attributes should probably be the Nomenclature Code or Name?
            // Storing the Code 'Si' is risky if code changes, but 'Silicon' (Name) is stable.
            // Storing ID is safest. Let's assume we store the Nomenclature Name or Code directly?
            // Actually, the field manager saves options.category.
            // Let's assume the attribute stores the Nomenclature Item ID or Name.
            // If we store the Name (e.g. 'Silicon'), we need to find the Code ('Si').

            // Let's assume we store the 'name' (e.g. 'Silicon') for readability in JSONB,
            // or we store the 'code' directly?
            // If we store 'code', then ID generation is trivial (just join them).
            // If we store 'name', we need to lookup code.

            // Decision: Store the 'name' or 'code'? 
            // Storing 'code' is best for the ID, but 'name' is best for reading the JSON without lookup.
            // Let's try to look up the code from the value.
            const item = nomenclatures.find(n =>
                n.category === field.options?.category &&
                (n.name === value || n.code === value)
            );

            if (item) {
                parts.push(item.code);
            } else {
                // If value is manually entered or not found, just use it
                parts.push(value);
            }
        }
    }

    return parts.join('-');
}

/**
 * Consistent date formatting to avoid hydration mismatches.
 * Uses es-ES locale for DD/MM/YYYY format.
 */
export function formatDate(date: string | Date | null | undefined): string {
    return libFormatDate(date);
}

/**
 * Formats a cell value for display based on its type.
 */
export function formatCellValue(value: any, type: string): string {
    if (value === null || value === undefined || value === '') return '-';

    if (type === 'boolean') {
        return value ? 'Yes' : 'No';
    }

    if (type === 'date') {
        return formatDate(value);
    }

    return String(value);
}
