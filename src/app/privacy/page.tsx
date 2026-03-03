export default function PrivacyPolicyPage() {
    const lastUpdated = "February 27, 2026";
    const appName = "PhD Nexus";
    const contactEmail = "rjeronimo@unizar.es";

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border p-10">
                <h1 className="text-3xl font-bold text-slate-900 mb-2">{appName} — Privacy Policy</h1>
                <p className="text-sm text-slate-500 mb-8">Last updated: {lastUpdated}</p>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">1. Introduction</h2>
                    <p className="text-slate-600 leading-relaxed">
                        {appName} (&quot;we&quot;, &quot;our&quot;, &quot;the application&quot;) is a private research management platform designed for academic research groups. This Privacy Policy explains how we collect, use, and protect your personal data when you use our application.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">2. Information We Collect</h2>
                    <p className="text-slate-600 leading-relaxed mb-3">When you use {appName}, we may collect the following information:</p>
                    <ul className="list-disc list-inside text-slate-600 space-y-2 leading-relaxed">
                        <li><strong>Account information:</strong> Your name and email address, provided when you sign up or sign in with Google.</li>
                        <li><strong>Google account data:</strong> If you sign in with Google, we receive basic profile information (name, email, profile picture) and, if you grant permission, access to your Google Drive files, Google Docs, and Google Slides that are explicitly created or selected by you within the application.</li>
                        <li><strong>Research data:</strong> Documents, notes, tasks, reports, and other research content you create or upload within the platform.</li>
                        <li><strong>Usage data:</strong> Basic activity logs such as login timestamps necessary for session management and security.</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">3. How We Use Google User Data</h2>
                    <p className="text-slate-600 leading-relaxed mb-3">
                        {appName} uses OAuth 2.0 to access Google services on your behalf. Specifically:
                    </p>
                    <ul className="list-disc list-inside text-slate-600 space-y-2 leading-relaxed">
                        <li>We access Google Drive <strong>only</strong> to create, read, and edit files that you explicitly initiate within the application.</li>
                        <li>We access Google Docs and Google Slides to generate and edit research reports and presentations as directed by you.</li>
                        <li>We do <strong>not</strong> scan, index, or analyze any Google Drive files beyond those you explicitly work with in the application.</li>
                        <li>We do <strong>not</strong> share your Google account data with any third parties.</li>
                        <li>Google access tokens are stored locally in your browser session and are never persisted to our servers beyond what is required for the current authenticated session.</li>
                    </ul>
                    <p className="text-slate-600 leading-relaxed mt-3">
                        Our use of Google APIs complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">4. Data Storage and Security</h2>
                    <p className="text-slate-600 leading-relaxed">
                        Your data is stored in a secure database hosted by Supabase (an EU-based hosted service), with row-level security ensuring each user and group can only access their own data. We implement industry-standard security practices including encrypted connections (HTTPS/TLS) for all data in transit.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">5. Data Sharing</h2>
                    <p className="text-slate-600 leading-relaxed">
                        We do <strong>not</strong> sell, trade, or otherwise transfer your personal information to third parties. Your data is only accessible to members of your research group within the application, as configured by your group administrator.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">6. Data Retention and Deletion</h2>
                    <p className="text-slate-600 leading-relaxed">
                        You may request deletion of your account and all associated data at any time by contacting us at the email address below. Upon request, we will permanently delete your personal data within 30 days, except where retention is required by law.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">7. Revoking Google Access</h2>
                    <p className="text-slate-600 leading-relaxed">
                        You can revoke {appName}&apos;s access to your Google account at any time by visiting <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google Account Permissions</a>. Revoking access will disable Google-integrated features but will not delete your {appName} account or data.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">8. Changes to This Policy</h2>
                    <p className="text-slate-600 leading-relaxed">
                        We may update this Privacy Policy from time to time. We will notify users of any significant changes by updating the date at the top of this page. Continued use of the application after changes constitutes acceptance of the updated policy.
                    </p>
                </section>

                <section className="mb-4">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">9. Contact</h2>
                    <p className="text-slate-600 leading-relaxed">
                        For any questions or requests regarding this Privacy Policy or your personal data, please contact us at:{" "}
                        <a href={`mailto:${contactEmail}`} className="text-indigo-600 hover:underline">{contactEmail}</a>
                    </p>
                </section>

                <div className="mt-10 pt-6 border-t text-center text-sm text-slate-400">
                    <a href="/login" className="hover:underline">Back to {appName}</a>
                    {" · "}
                    <a href="/terms" className="hover:underline">Terms of Service</a>
                </div>
            </div>
        </div>
    );
}
