import { Loader2, TicketCheck } from "lucide-react";
import { useState } from "react";

interface RTTProps {
    tokenId: number;
    matchId: string;
    status: string;
    ticketRef?: string;
    category?: string;
    seat?: string;
    onRedeem?: (tokenId: number) => Promise<void> | void;
}

export default function RTTCard({ tokenId, matchId, status, ticketRef, category, seat, onRedeem }: RTTProps) {
    const [loading, setLoading] = useState(false);

    async function handleRedeem() {
        if (!onRedeem) return;

        try {
            setLoading(true);
            await onRedeem(tokenId);
        } finally {
            setLoading(false);
        }
    }

    const isRedeemable = status === "RTT";

    return (
        <div className="rounded-[24px] border border-white/10 bg-slate-900/75 p-6 shadow-2xl shadow-slate-950/20 backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">Ticket</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">RTT #{tokenId}</h2>
                </div>
                <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-400">
                    <TicketCheck size={20} />
                </div>
            </div>

            <div className="space-y-3 text-sm text-slate-400">
                <p>
                    Match: <span className="ml-1 font-medium text-white">{matchId}</span>
                </p>
                <p>
                    Status:
                    <span className="ml-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                        {status}
                    </span>
                </p>
                {category && (
                    <p>
                        Category: <span className="ml-1 font-medium text-white">{category}</span>
                    </p>
                )}
                {seat && (
                    <p>
                        Seat: <span className="ml-1 font-medium text-white">{seat}</span>
                    </p>
                )}
                {ticketRef && (
                    <p>
                        Ticket Ref:
                        <span className="mt-1 block break-all text-slate-300">{ticketRef}</span>
                    </p>
                )}
            </div>

            {isRedeemable && (
                <button
                    type="button"
                    onClick={handleRedeem}
                    disabled={loading}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {loading ? (
                        <>
                            <Loader2 className="animate-spin" size={16} />
                            Redeeming...
                        </>
                    ) : (
                        "Redeem RTT"
                    )}
                </button>
            )}

            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-800/70 p-4 text-sm text-slate-400">
                RTT is soulbound. This token cannot be transferred.
            </div>
        </div>
    );
}