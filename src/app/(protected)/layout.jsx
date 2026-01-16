import MainLayout from '@/components/layout/MainLayout';

export default function ProtectedLayout({ children }) {
    return (
        <MainLayout>
            {children}
        </MainLayout>
    );
}
