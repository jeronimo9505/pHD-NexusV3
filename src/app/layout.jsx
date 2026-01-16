import './globals.css';
import Providers from '@/components/providers/Providers';

export const metadata = {
    title: 'PHD Nexus',
    description: 'Project Management System',
};

export default function RootLayout({ children }) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body suppressHydrationWarning>
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    );
}
