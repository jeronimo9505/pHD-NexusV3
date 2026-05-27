/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Client-side Router Cache: pages visited within these windows
    // are served instantly from memory without hitting the server again.
    experimental: {
        staleTimes: {
            dynamic: 60,   // Cache dynamic pages for 60 seconds
            static: 300,   // Cache static pages for 5 minutes
        },
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin-allow-popups',
                    },
                    {
                        key: 'Cross-Origin-Embedder-Policy',
                        value: 'unsafe-none',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
