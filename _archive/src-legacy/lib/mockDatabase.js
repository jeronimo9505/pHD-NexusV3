// Mock Database
// Simulates database operations using localStorage

import { MOCK_USERS } from '../data/mockUsers';
import { MOCK_GROUPS, MOCK_GROUP_MEMBERS } from '../data/mockGroups';

const DB_PREFIX = 'phd_nexus_db_';

// Initialize database with mock data if not exists
// Initialize database with mock data if not exists
function initializeDB() {
    if (typeof window === 'undefined') return; // Guard for SSR

    if (!localStorage.getItem(`${DB_PREFIX}initialized`)) {
        localStorage.setItem(`${DB_PREFIX}profiles`, JSON.stringify(MOCK_USERS));
        localStorage.setItem(`${DB_PREFIX}groups`, JSON.stringify(MOCK_GROUPS));
        localStorage.setItem(`${DB_PREFIX}group_members`, JSON.stringify(MOCK_GROUP_MEMBERS));
        localStorage.setItem(`${DB_PREFIX}reports`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}report_sections`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}tasks`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}task_assignees`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}knowledge_items`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}report_comments`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}report_annotations`, JSON.stringify([])); // Highlights & Task selection
        localStorage.setItem(`${DB_PREFIX}report_resources`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}report_resources`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}report_views`, JSON.stringify([]));
        // New tables for Drive Reports Social Features
        localStorage.setItem(`${DB_PREFIX}drive_report_views`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}drive_report_comments`, JSON.stringify([]));
        localStorage.setItem(`${DB_PREFIX}announcements`, JSON.stringify([])); // NEW: Announcements
        localStorage.setItem(`${DB_PREFIX}announcement_comments`, JSON.stringify([])); // NEW: Announcement Comments
        localStorage.setItem(`${DB_PREFIX}initialized`, 'true');
    }
}

// Get table data
function getTable(tableName) {
    if (typeof window === 'undefined') return []; // Guard for SSR
    const data = localStorage.getItem(`${DB_PREFIX}${tableName}`);
    return data ? JSON.parse(data) : [];
}

// Save table data
function saveTable(tableName, data) {
    if (typeof window === 'undefined') return; // Guard for SSR
    localStorage.setItem(`${DB_PREFIX}${tableName}`, JSON.stringify(data));
}

// Generate UUID (simple version)
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Mock Database API
export const mockDB = {
    // SELECT
    select(tableName, options = {}) {
        initializeDB();
        let data = getTable(tableName);
        console.log(`[MockDB] Select ${tableName} (Total: ${data.length})`, options);

        // Apply filters
        if (options.eq) {
            Object.entries(options.eq).forEach(([key, value]) => {
                data = data.filter(item => item[key] === value);
            });
        }
        console.log(`[MockDB] Filtered Result: ${data.length} records`);

        // Apply order
        if (options.order) {
            const { column, ascending = true } = options.order;
            data.sort((a, b) => {
                if (a[column] < b[column]) return ascending ? -1 : 1;
                if (a[column] > b[column]) return ascending ? 1 : -1;
                return 0;
            });
        }

        // Apply limit
        if (options.limit) {
            data = data.slice(0, options.limit);
        }

        return Promise.resolve({ data, error: null });
    },

    // INSERT
    insert(tableName, records) {
        initializeDB();
        const data = getTable(tableName);
        const newRecords = Array.isArray(records) ? records : [records];

        // Add IDs and timestamps if not present
        const recordsWithIds = newRecords.map(record => ({
            id: record.id || generateId(),
            created_at: record.created_at || new Date().toISOString(),
            ...record
        }));

        data.push(...recordsWithIds);
        saveTable(tableName, data);

        return Promise.resolve({
            data: Array.isArray(records) ? recordsWithIds : recordsWithIds[0],
            error: null
        });
    },

    // UPDATE
    update(tableName, id, updates) {
        initializeDB();
        const data = getTable(tableName);
        const index = data.findIndex(item => item.id === id);

        if (index === -1) {
            return Promise.resolve({ data: null, error: { message: 'Record not found' } });
        }

        data[index] = {
            ...data[index],
            ...updates,
            updated_at: new Date().toISOString()
        };

        saveTable(tableName, data);

        return Promise.resolve({ data: data[index], error: null });
    },

    // DELETE
    delete(tableName, id) {
        initializeDB();
        const data = getTable(tableName);
        const filtered = data.filter(item => item.id !== id);

        if (filtered.length === data.length) {
            return Promise.resolve({ data: null, error: { message: 'Record not found' } });
        }

        saveTable(tableName, filtered);

        return Promise.resolve({ data: { id }, error: null });
    },

    // UPSERT (update or insert)
    upsert(tableName, record, conflictKeys = ['id']) {
        initializeDB();
        const data = getTable(tableName);

        // Find existing record
        const existingIndex = data.findIndex(item =>
            conflictKeys.every(key => item[key] === record[key])
        );

        if (existingIndex >= 0) {
            // Update existing
            data[existingIndex] = {
                ...data[existingIndex],
                ...record,
                updated_at: new Date().toISOString()
            };
            saveTable(tableName, data);
            return Promise.resolve({ data: data[existingIndex], error: null });
        } else {
            // Insert new
            return this.insert(tableName, record);
        }
    },

    // COUNT
    count(tableName, options = {}) {
        initializeDB();
        let data = getTable(tableName);

        // Apply filters
        if (options.eq) {
            Object.entries(options.eq).forEach(([key, value]) => {
                data = data.filter(item => item[key] === value);
            });
        }

        return Promise.resolve({ count: data.length, error: null });
    },

    // RESET DATABASE (Restores default data)
    reset() {
        if (typeof window === 'undefined') return;
        Object.keys(localStorage)
            .filter(key => key.startsWith(DB_PREFIX))
            .forEach(key => localStorage.removeItem(key));
        initializeDB(); // Reseeds data
    },

    // CLEAR DATABASE (Empty state for testing onboarding)
    clear() {
        if (typeof window === 'undefined') return;

        // Clear DB keys
        Object.keys(localStorage)
            .filter(key => key.startsWith(DB_PREFIX))
            .forEach(key => localStorage.removeItem(key));

        // Clear Session
        localStorage.removeItem('phd_nexus_session');

        // Mark as initialized but empty to prevent auto-seeding
        localStorage.setItem(`${DB_PREFIX}initialized`, 'true');
        // Initialize empty tables
        localStorage.setItem(`${DB_PREFIX}profiles`, '[]');
        localStorage.setItem(`${DB_PREFIX}groups`, '[]');
        localStorage.setItem(`${DB_PREFIX}group_members`, '[]');
        localStorage.setItem(`${DB_PREFIX}reports`, '[]');
        localStorage.setItem(`${DB_PREFIX}tasks`, '[]');
    }
};

// Initialize on import - REMOVED to prevent SSR crash, called in methods instead
// initializeDB(); 

