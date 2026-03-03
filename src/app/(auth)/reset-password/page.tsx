import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ message?: string }>;
}) {
    const updatePassword = async (formData: FormData) => {
        "use server";
        const password = formData.get("password") as string;
        const confirmPassword = formData.get("confirmPassword") as string;
        const supabase = await createClient();

        if (password !== confirmPassword) {
            return redirect("/reset-password?message=Passwords do not match");
        }

        const { error } = await supabase.auth.updateUser({
            password: password,
        });

        if (error) {
            return redirect(`/reset-password?message=${encodeURIComponent(error.message)}`);
        }

        return redirect("/dashboard");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-lg border">
                <div className="mb-6 text-center">
                    <h1 className="text-xl font-bold text-slate-900">Set New Password</h1>
                    <p className="text-slate-500 text-sm">Enter your new password below</p>
                </div>

                <form action={updatePassword} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">New Password</label>
                        <input name="password" type="password" required minLength={6} className="w-full border rounded-lg px-3 py-2" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Confirm Password</label>
                        <input name="confirmPassword" type="password" required minLength={6} className="w-full border rounded-lg px-3 py-2" />
                    </div>

                    <button className="w-full bg-slate-900 text-white py-2 rounded-lg hover:bg-slate-800">
                        Update Password
                    </button>
                </form>
            </div>
        </div>
    );
}
