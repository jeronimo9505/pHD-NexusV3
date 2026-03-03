import { createClient } from "@/lib/supabase/server"; // Use server client for actions if needed, or client lib in client comp
import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";

export default function ForgotPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ message?: string; success?: string }>;
}) {
    const resetPassword = async (formData: FormData) => {
        "use server";
        const email = formData.get("email") as string;
        const supabase = await createClient(); // Server action context
        const origin = (await headers()).get("origin");

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${origin}/auth/callback?next=/reset-password`,
        });

        if (error) {
            return redirect(`/forgot-password?message=${encodeURIComponent(error.message)}`);
        }

        return redirect("/forgot-password?success=Check your email for the reset link");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-lg border">
                <div className="mb-6 text-center">
                    <h1 className="text-xl font-bold text-slate-900">Reset Password</h1>
                    <p className="text-slate-500 text-sm">Enter your email to receive a reset link</p>
                </div>

                <form action={resetPassword} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <input name="email" type="email" required className="w-full border rounded-lg px-3 py-2" />
                    </div>

                    <button className="w-full bg-slate-900 text-white py-2 rounded-lg hover:bg-slate-800">
                        Send Reset Link
                    </button>

                    <div className="text-center">
                        <Link href="/login" className="text-sm text-blue-600 hover:underline">
                            Back to Login
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
