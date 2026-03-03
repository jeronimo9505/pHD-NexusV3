export default function TermsPage() {
    const lastUpdated = "February 27, 2026";
    const appName = "PhD Nexus";
    const contactEmail = "rjeronimo@unizar.es";

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border p-10">
                <h1 className="text-3xl font-bold text-slate-900 mb-2">{appName} — Terms of Service</h1>
                <p className="text-sm text-slate-500 mb-8">Last updated: {lastUpdated}</p>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">1. Acceptance of Terms</h2>
                    <p className="text-slate-600 leading-relaxed">
                        By accessing or using {appName}, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application. {appName} is a private research management tool intended for use by authorized members of academic research groups.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">2. Permitted Use</h2>
                    <p className="text-slate-600 leading-relaxed">
                        {appName} is provided exclusively for academic and research management purposes. You agree to use the application only for lawful purposes and in accordance with these Terms. You may not use the application to store or transmit illegal, harmful, or offensive content.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">3. User Accounts</h2>
                    <p className="text-slate-600 leading-relaxed">
                        Access to {appName} is restricted to invited members. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. You must notify us immediately of any unauthorized use of your account.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">4. Google Services Integration</h2>
                    <p className="text-slate-600 leading-relaxed">
                        {appName} integrates with Google services (Drive, Docs, Slides) to facilitate research workflows. By connecting your Google account, you authorize {appName} to access and manage files you explicitly create or select within the application. You may revoke this access at any time through your Google account settings.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">5. Intellectual Property</h2>
                    <p className="text-slate-600 leading-relaxed">
                        All research content, documents, and data you create within {appName} remain your property. We claim no intellectual property rights over your content. The application code and design of {appName} are proprietary.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">6. Limitation of Liability</h2>
                    <p className="text-slate-600 leading-relaxed">
                        {appName} is provided &quot;as is&quot; for academic research purposes without warranties of any kind. We are not liable for any loss of data or damages arising from the use or inability to use the application. We strongly recommend maintaining your own backups of important research data.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">7. Changes to Terms</h2>
                    <p className="text-slate-600 leading-relaxed">
                        We reserve the right to modify these Terms at any time. Continued use of the application after changes constitutes acceptance of the new Terms.
                    </p>
                </section>

                <section className="mb-4">
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">8. Contact</h2>
                    <p className="text-slate-600 leading-relaxed">
                        For questions about these Terms, contact us at:{" "}
                        <a href={`mailto:${contactEmail}`} className="text-indigo-600 hover:underline">{contactEmail}</a>
                    </p>
                </section>

                <div className="mt-10 pt-6 border-t text-center text-sm text-slate-400">
                    <a href="/login" className="hover:underline">Back to {appName}</a>
                    {" · "}
                    <a href="/privacy" className="hover:underline">Privacy Policy</a>
                </div>
            </div>
        </div>
    );
}
