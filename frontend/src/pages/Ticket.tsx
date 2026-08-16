import { useEffect, useState } from "react";
import RTTCard from "../components/RTTCard";
import { useWallet } from "../hooks/useWallet";
import { issueTicket, getOrderByRttTokenId } from "../services/api";
import { getUserRTTs } from "../services/contract";

interface RTT {
    tokenId: number;
    matchId: string;
    status: string;
    ticketRef?: string;
    category?: string;
    seat?: string;
}

export default function Ticket() {
    const { address, connected } = useWallet();
    const [tickets, setTickets] = useState<RTT[]>([]);
    const [loading, setLoading] = useState(false);

    async function loadTickets() {
        try {
            if (!address) {
                return;
            }

            setLoading(true);
            const data = await getUserRTTs(address);
            
            // For each RTT, try to fetch order details to get category + seat
            const enrichedData = await Promise.all(
                data.map(async (rtt) => {
                    try {
                        const order = await getOrderByRttTokenId(rtt.tokenId);
                        return {
                            ...rtt,
                            category: order.data?.category,
                            seat: order.data?.seat
                        };
                    } catch (error) {
                        // If no order found, just return RTT as is
                        console.log(`No order found for RTT #${rtt.tokenId}`);
                        return rtt;
                    }
                })
            );
            
            setTickets(enrichedData);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function handleRedeemTicket(tokenId: number) {
        try {
            await issueTicket(tokenId, "");
            await loadTickets();
        } catch (error: any) {
            console.error("Redeem RTT failed:", error);
            alert(error?.response?.data?.message || error?.message || "Không thể redeem RTT");
        }
    }

    useEffect(() => {
        if (!address) {
            setTickets([]);
            return;
        }

        loadTickets();
    }, [address]);

    if (!connected) {
        return (
            <div className="flex min-h-screen items-center justify-center px-4 py-16">
                <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-slate-900/70 p-10 text-center shadow-2xl shadow-slate-950/30 backdrop-blur">
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Ticket portal</p>
                    <h1 className="mt-3 text-4xl font-bold text-white">My Tickets</h1>
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
                            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Ticket hub</p>
                            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">My Tickets</h1>
                            <p className="mt-3 max-w-2xl text-slate-400">Review your RTT tokens and keep track of their status and ticket references.</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-800/70 px-4 py-3 text-sm text-slate-300">
                            Connected wallet: <span className="ml-1 font-medium text-white">{address}</span>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-8 text-center text-slate-300">
                        Loading ticket data...
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {tickets.length === 0 ? (
                            <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-8 text-slate-300">
                                No ticket found.
                            </div>
                        ) : (
                            tickets.map((ticket) => (
                                <RTTCard
                                    key={ticket.tokenId}
                                    tokenId={ticket.tokenId}
                                    matchId={ticket.matchId}
                                    status={ticket.status}
                                    ticketRef={ticket.ticketRef}
                                    category={ticket.category}
                                    seat={ticket.seat}
                                    onRedeem={handleRedeemTicket}
                                />
                            ))
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}