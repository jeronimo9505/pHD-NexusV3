import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
export default defineConfig([
    ...nextVitals,
    // Compiler adoption is incremental; hook order stays a blocking check.
    { rules: {
        'react-hooks/set-state-in-effect': 'warn',
        'react-hooks/refs': 'warn',
        'react-hooks/purity': 'warn',
        'react-hooks/immutability': 'warn',
        'react-hooks/preserve-manual-memoization': 'warn',
        'react-hooks/static-components': 'warn',
    } },
    globalIgnores(['.next/**', 'out/**', 'dist/**', 'node_modules/**', '_archive/**', 'src-tauri/target/**', 'next-env.d.ts']),
]);
