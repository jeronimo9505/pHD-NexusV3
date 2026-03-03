import React from 'react';

export default function EditableArea({ isEditing, value, onChange, onBlur, placeholder, minHeight = "h-auto" }) {
    if (isEditing) {
        return (
            <textarea
                className={`w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm text-slate-700 leading-relaxed ${minHeight}`}
                rows={minHeight === "h-32" ? 5 : 3}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
            />
        );
    }
    return (
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {value || <span className="text-slate-400 italic">Sin contenido...</span>}
        </p>
    );
}
