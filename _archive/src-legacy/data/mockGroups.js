// Mock Groups Data
// Research groups and memberships for local development

export const MOCK_GROUPS = [
    {
        id: 'group1',
        name: 'Research Lab Alpha',
        description: 'Main research laboratory for PhD students',
        code: 'ALPHA2024',
        created_by: 'adm1',
        created_at: '2024-01-01T00:00:00Z'
    }
];

export const MOCK_GROUP_MEMBERS = [
    {
        id: 'gm1',
        group_id: 'group1',
        user_id: 'adm1',
        role: 'supervisor',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z'
    },
    {
        id: 'gm2',
        group_id: 'group1',
        user_id: 'student1',
        role: 'student',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z'
    },
    {
        id: 'gm3',
        group_id: 'group1',
        user_id: 'supervisor1',
        role: 'supervisor',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z'
    },
    {
        id: 'gm4',
        group_id: 'group1',
        user_id: 'labmanager1',
        role: 'labmanager',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z'
    }
];

// Helper functions
export function getGroupById(id) {
    return MOCK_GROUPS.find(g => g.id === id);
}

export function getGroupsByUserId(userId) {
    const membershipIds = MOCK_GROUP_MEMBERS
        .filter(m => m.user_id === userId && m.status === 'active')
        .map(m => m.group_id);

    return MOCK_GROUPS.filter(g => membershipIds.includes(g.id));
}

export function getGroupMembers(groupId) {
    return MOCK_GROUP_MEMBERS.filter(m => m.group_id === groupId);
}

export function getUserRoleInGroup(userId, groupId) {
    const membership = MOCK_GROUP_MEMBERS.find(
        m => m.user_id === userId && m.group_id === groupId
    );
    return membership?.role || null;
}
