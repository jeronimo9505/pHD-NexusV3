// Mock Users Data
// Simple authentication data for local development

export const MOCK_USERS = [
    {
        id: 'adm1',
        email: 'adm@phd.com',
        password: '123456',
        full_name: 'Admin User',
        avatar_url: null,
        system_role: 'admin',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
    },
    {
        id: 'student1',
        email: 'student1@phd.com',
        password: '123456',
        full_name: 'Student One',
        avatar_url: null,
        system_role: 'user',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
    },
    {
        id: 'supervisor1',
        email: 'supervisor1@phd.com',
        password: '123456',
        full_name: 'Supervisor One',
        avatar_url: null,
        system_role: 'user',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
    },
    {
        id: 'labmanager1',
        email: 'labmanager1@phd.com',
        password: '123456',
        full_name: 'Lab Manager One',
        avatar_url: null,
        system_role: 'user',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
    }
];

// Helper function to find user by credentials
export function findUserByCredentials(email, password) {
    return MOCK_USERS.find(u => u.email === email && u.password === password);
}

// Helper function to find user by id
export function findUserById(id) {
    return MOCK_USERS.find(u => u.id === id);
}
