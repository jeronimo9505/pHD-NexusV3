import { useAuth } from '@/context/AuthContext';

export function useRBAC() {
    const { can, roles, permissions } = useAuth();
    return { can, roles, permissions };
}
