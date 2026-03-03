import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signInAction } from "@/features/auth/actions";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ message?: string }>;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        return redirect('/dashboard');
    }

    const params = await searchParams;

    const handleSignIn = async (formData: FormData) => {
        "use server";
        const result = await signInAction(formData);

        if (result?.error) {
            redirect(`/login?message=${encodeURIComponent(result.error)}`);
        } else {
            redirect("/dashboard");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-lg border">
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-bold text-slate-900">PhD Nexus</h1>
                    <p className="text-slate-500">Sign in to your account</p>
                </div>

                {/* ── Google OAuth Button (popup) ── */}
                <GoogleSignInButton />

                {/* ── Divider ── */}
                <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-slate-400 text-xs">or sign in with email</span>
                    <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* ── Email / Password Form ── */}
                <form action={handleSignIn} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <input name="email" type="email" required className="w-full border rounded-lg px-3 py-2" />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium">Password</label>
                            <Link href="/forgot-password" className="text-xs text-indigo-600 hover:underline">
                                Forgot password?
                            </Link>
                        </div>
                        <input name="password" type="password" required className="w-full border rounded-lg px-3 py-2" />
                    </div>

                    {params?.message && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                            {params.message}
                        </div>
                    )}

                    <button className="w-full bg-slate-900 text-white py-2 rounded-lg hover:bg-slate-800">
                        Sign In
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-500">
                    Don't have an account?{" "}
                    <Link href="/register" className="text-slate-900 font-medium hover:underline">
                        Sign Up
                    </Link>
                </div>
            </div>
        </div>
    );
}
