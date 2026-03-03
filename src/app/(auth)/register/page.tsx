import { signUpAction } from "@/features/auth/actions";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function RegisterPage({
    searchParams,
}: {
    searchParams: Promise<{ message?: string; success?: string }>;
}) {
    const params = await searchParams;

    const handleSignUp = async (formData: FormData) => {
        "use server";
        const result = await signUpAction(formData);

        if (result?.error) {
            redirect(`/register?message=${encodeURIComponent(result.error)}`);
        } else if (result?.success) {
            if (result.message) {
                redirect(`/login?success=${encodeURIComponent(result.message)}`);
            } else {
                redirect("/dashboard");
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-lg border">
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-bold text-slate-900">PhD Nexus</h1>
                    <p className="text-slate-500">Create your account</p>
                </div>

                <form action={handleSignUp} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Full Name</label>
                        <input name="full_name" type="text" required className="w-full border rounded-lg px-3 py-2" placeholder="John Doe" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <input name="email" type="email" required className="w-full border rounded-lg px-3 py-2" placeholder="name@example.com" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Password</label>
                        <input name="password" type="password" required minLength={6} className="w-full border rounded-lg px-3 py-2" placeholder="••••••••" />
                    </div>

                    {params?.message && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                            {params.message}
                        </div>
                    )}

                    <button className="w-full bg-slate-900 text-white py-2 rounded-lg hover:bg-slate-800">
                        Sign Up
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-500">
                    Already have an account?{" "}
                    <Link href="/login" className="text-slate-900 font-medium hover:underline">
                        Sign In
                    </Link>
                </div>
            </div>
        </div>
    );
}
