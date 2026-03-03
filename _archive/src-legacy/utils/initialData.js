export const MASTER_USER = {
    id: 'adm1',
    name: 'Master Admin',
    role: 'admin',
    email: 'admin@phd.nexus',
    username: 'adm1',
    password: 'adm1',
    memberships: ['*']
};

export const INITIAL_REQUESTS = [];

export const INITIAL_TASKS = [];

export const INITIAL_KNOWLEDGE = [];

export const EMPTY_REPORT = {
    id: '',
    startDate: '',
    endDate: '',
    context: '',
    experimental: '',
    findings: '',
    difficulties: '',
    nextSteps: '',
    images: [],
    status: 'draft',
    reviewedBy: '',
    supervisorFeedback: '',
    sectionComments: {
        context: [],
        experimental: [],
        findings: [],
        difficulties: [],
        nextSteps: []
    },
    resources: [],
    tasks: [],
    createdAt: new Date().toISOString()
};

export const INITIAL_REPORTS = [];

export const INITIAL_GROUPS = [];

export const INITIAL_ACTIVITIES = [];
