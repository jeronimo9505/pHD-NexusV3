export interface AdminSnapshot {
    users: any[];
    groups: any[];
    stats: { totalUsers: number; totalGroups: number; totalReports: number; totalTasks: number };
    notifications: any[];
}
