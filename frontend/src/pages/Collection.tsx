import { useEffect, useState } from "react";
import RTBCard from "../components/RTBCard";
import { useWallet } from "../hooks/useWallet";
import { getUserRTBs } from "../services/contract";

const HIDDEN_REDEEMED_RTBS_KEY = "hidden-redeemed-rtbs";

function getHiddenRedeemedRTBs(): number[] {
    try {
        const raw = localStorage.getItem(HIDDEN_REDEEMED_RTBS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

interface RTB {
    tokenId: number;
    matchId: string;
    owner: string;
}

interface RTT {
    tokenId: number;
    matchId: string;
    status: string;
    ticketRef?: string;
}

export default function Collection() {
    const { address, connected } = useWallet();
    const [rtbs, setRTBs] = useState<RTB[]>([]);
    const [loading, setLoading] = useState(false);
    const [recentPurchase, setRecentPurchase] = useState<string | null>(null);

    async function loadCollection() {
        try {
            if (!address) {
                return;
            }

            setLoading(true);
            const rtbData = await getUserRTBs(address);

            const hiddenRTBIds = new Set(getHiddenRedeemedRTBs());
            const visibleRTBs = rtbData.filter((rtb) => !hiddenRTBIds.has(rtb.tokenId));

            setRTBs(visibleRTBs);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!address) {
            setRTBs([]);
            setRecentPurchase(null);
            return;
        }

        const savedPurchase = localStorage.getItem("lastPurchasedRTB");
        if (savedPurchase) {
            try {
                setRecentPurchase(JSON.parse(savedPurchase).label);
            } catch {
                setRecentPurchase(null);
            }
        }

        void loadCollection();

        const timers = [4000, 10000].map((delay) =>
            window.setTimeout(() => {
                void loadCollection();
            }, delay)
        );

        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [address]);

    if (!connected) {
        return (
            <div className="flex min-h-screen items-center justify-center px-4 py-16">
                <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-slate-900/70 p-10 text-center shadow-2xl shadow-slate-950/30 backdrop-blur">
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Wallet access</p>
                    <h1 className="mt-3 text-4xl font-bold text-white">My Collection</h1>
                    <p className="mt-4 text-slate-400">Connect your wallet.</p>
                </div>
            </div>
        );
    }

    return (
        <main className="flex min-h-screen w-full justify-center px-4 py-8 sm:px-6 lg:px-8">
            <div className="w-full max-w-7xl">
                <div className="mb-10 rounded-[28px] border border-white/10 bg-slate-900/65 p-8 shadow-2xl shadow-slate-950/20 backdrop-blur">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Portfolio</p>
                            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">My Collection</h1>
                            <p className="mt-3 max-w-2xl text-slate-400">Manage your digital assets, transfer RTBs, and redeem ticket rights seamlessly.</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-800/70 px-4 py-3 text-sm text-slate-300">
                            Connected wallet: <span className="ml-1 font-medium text-white">{address}</span>
                        </div>
                    </div>
                </div>

                {recentPurchase && (
                    <div className="mb-6 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                        Đang kiểm tra RTB mới cho {recentPurchase}...
                    </div>
                )}

                {loading ? (
                    <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-8 text-center text-slate-300">
                        Loading your assets...
                    </div>
                ) : (
                    <div className="grid gap-6 lg:grid-cols-2">
                        {rtbs.map((rtb) => (
                            <RTBCard key={rtb.tokenId} tokenId={rtb.tokenId} matchId={rtb.matchId} owner={rtb.owner} />
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}