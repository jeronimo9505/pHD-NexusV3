import { Toaster } from 'sonner';
import { Inter } from 'next/font/google';
import './globals.css'; // Assuming we will copy or link globals.css later

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
    title: 'PhD Nexus V3',
    description: 'Research Group Management Platform',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={inter.className}>
                {children}
                <Toaster position="top-right" richColors />
            </body>
        </html>
    );
}
