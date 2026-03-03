import { LucideIcon } from "lucide-react";

interface StatsCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    trend?: string;
    trendUp?: boolean;
    color?: 'blue' | 'green' | 'purple' | 'amber';
}

export function StatsCard({ label, value, icon: Icon, trend, trendUp, color = 'blue' }: StatsCardProps) {
    const colorStyles = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        purple: 'bg-purple-50 text-purple-600',
        amber: 'bg-amber-50 text-amber-600',
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${colorStyles[color]}`}>
                    <Icon size={24} />
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">{label}</p>
                    <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
                    {trend && (
                        <p className={`text-xs font-medium mt-1 ${trendUp ? 'text-green-600' : 'text-red-500'}`}>
                            {trend}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
