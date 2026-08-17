import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Sparkles, Wallet } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import { getUserRTBs, transferRTB } from "../services/contract";

interface MarketplaceLocationState {
    tokenId?: number;
    matchId?: string;
    owner?: string;
}

interface MarketplaceListing {
    id: string;
    tokenId: number;
    matchId: string;
    owner: string;
    sellerAddress: string;
    price: number;
    fee: number;
    sellerReceives: number;
    status: "active" | "pending" | "sold";
    buyerAddress?: string;
    createdAt: string;
}

const STORAGE_KEY = "marketplace-listings";

export default function Marketplace() {
    const navigate = useNavigate();
    const location = useLocation();
    const { address, connected } = useWallet();

    const state = (location.state as MarketplaceLocationState | null) ?? {};
    const defaultTokenId = state.tokenId ?? 1;
    const defaultMatchId = state.matchId ?? "MATCH-001";
    const defaultOwner = state.owner ?? "0x000...";

    const [tokenId, setTokenId] = useState(defaultTokenId);
    const [matchId, setMatchId] = useState(defaultMatchId);
    const [price, setPrice] = useState(50);
    const [listings, setListings] = useState<MarketplaceListing[]>([]);
    const [ownedRTBs, setOwnedRTBs] = useState<Array<{ tokenId: number; matchId: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const previousWalletRef = useRef<string | null>(null);
    const previousConnectedRef = useRef(false);
    const hasInitializedWalletRef = useRef(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as MarketplaceListing[];
                setListings(parsed);
            } else {
                setListings([]);
            }
        } catch {
            setListings([]);
        }
    }, []);

    useEffect(() => {
        if (!hasInitializedWalletRef.current) {
            hasInitializedWalletRef.current = true;
            previousWalletRef.current = address ?? null;
            previousConnectedRef.current = connected;
            return;
        }

        const walletChanged = previousWalletRef.current !== address || previousConnectedRef.current !== connected;
        if (!walletChanged) {
            previousWalletRef.current = address ?? null;
            previousConnectedRef.current = connected;
            return;
        }

        setOwnedRTBs([]);
        setTokenId(1);
        setMatchId("MATCH-001");
        setPrice(50);
        setMessage("");

        previousWalletRef.current = address ?? null;
        previousConnectedRef.current = connected;
    }, [address, connected]);

    useEffect(() => {
        async function loadOwnedRTBs() {
            if (!connected || !address) {
                setOwnedRTBs([]);
                setTokenId(1);
                setMatchId("MATCH-001");
                setPrice(50);
                setMessage("");
                return;
            }

            try {
                const owned = await getUserRTBs(address);
                setOwnedRTBs(owned);

                const hasExplicitSelection = typeof state.tokenId === "number" && typeof state.matchId === "string" && state.matchId.trim().length > 0;
                if (!hasExplicitSelection && owned.length > 0) {
                    setTokenId(owned[0].tokenId);
                    setMatchId(owned[0].matchId);
                }
            } catch {
                setOwnedRTBs([]);
            }
        }

        void loadOwnedRTBs();
    }, [address, connected, state.matchId, state.tokenId]);

    const selectedLabel = useMemo(() => {
        return `RTB #${tokenId} · ${matchId}`;
    }, [tokenId, matchId]);

    function saveListings(nextListings: MarketplaceListing[]) {
        setListings(nextListings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextListings));
    }

    async function handleCreateListing() {
        try {
            if (!connected || !address) {
                setMessage("Vui lòng kết nối ví trước khi đăng pack lên marketplace");
                return;
            }

            if (!tokenId || !matchId.trim()) {
                setMessage("Vui lòng nhập token ID và match ID");
                return;
            }

            const hasOwnedToken = ownedRTBs.some((item) => item.tokenId === Number(tokenId));
            if (!hasOwnedToken) {
                setMessage("Ví này chưa có RTB này nên không thể đăng lên marketplace");
                return;
            }

            const fee = Number((price * 0.15).toFixed(2));
            const sellerReceives = Number((price - fee).toFixed(2));

            const listing: MarketplaceListing = {
                id: `${Date.now()}-${tokenId}`,
                tokenId: Number(tokenId),
                matchId: matchId.trim(),
                owner: defaultOwner,
                sellerAddress: address,
                price: Number(price),
                fee,
                sellerReceives,
                status: "active",
                createdAt: new Date().toISOString()
            };

            const next = [listing, ...listings];
            saveListings(next);
            setMessage(`Đã đăng RTB #${tokenId} lên marketplace với giá ${price} USDT`);
        } catch (error: any) {
            setMessage(error?.message || "Không thể đăng listing");
        }
    }

    async function handleBuy(listing: MarketplaceListing) {
        try {
            if (!connected || !address) {
                setMessage("Vui lòng kết nối ví trước khi mua pack");
                return;
            }

            if (address.toLowerCase() === listing.sellerAddress.toLowerCase()) {
                setMessage("Bạn đang là người bán, hãy chờ người khác mua hoặc dùng nút duyệt giao dịch");
                return;
            }

            const next = listings.map((item) =>
                item.id === listing.id
                    ? { ...item, status: "pending" as const, buyerAddress: address }
                    : item
            );
            saveListings(next);
            setMessage(`Yêu cầu mua RTB #${listing.tokenId} đã được gửi. Người bán sẽ duyệt giao dịch.`);
        } catch (error: any) {
            setMessage(error?.message || "Không thể tạo yêu cầu mua");
        }
    }

    async function handleApproveTransfer(listing: MarketplaceListing) {
        try {
            if (!connected || !address) {
                setMessage("Vui lòng kết nối ví trước khi duyệt giao dịch");
                return;
            }

            if (!listing.buyerAddress) {
                setMessage("Chưa có người mua để duyệt");
                return;
            }

            if (address.toLowerCase() !== listing.sellerAddress.toLowerCase()) {
                setMessage("Chỉ người bán mới có thể duyệt giao dịch này");
                return;
            }

            setLoading(true);
            setMessage("");
            const txHash = await transferRTB(listing.buyerAddress, listing.tokenId);

            const next = listings.map((item) =>
                item.id === listing.id
                    ? {
                        ...item,
                        status: "sold" as const,
                        owner: listing.buyerAddress ?? item.owner,
                        buyerAddress: listing.buyerAddress ?? item.buyerAddress
                    }
                    : item
            );
            saveListings(next);
            setMessage(`Giao dịch đã được duyệt. TX: ${txHash.slice(0, 12)}...`);
        } catch (error: any) {
            setMessage(error?.message || "Duyệt giao dịch thất bại");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto min-h-[70vh] max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="w-full rounded-[32px] border border-white/10 bg-slate-900/75 p-8 shadow-2xl shadow-slate-950/20 backdrop-blur">
                <button
                    onClick={() => navigate(-1)}
                    className="rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-sm text-slate-300"
                >
                    ← Quay lại
                </button>

                <div className="mt-6 grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Marketplace</p>
                        <h1 className="mt-3 text-3xl font-semibold text-white">Sàn giao dịch RTB chung cho các ví</h1>
                        <p className="mt-3 text-slate-400">
                            Khi bạn đăng một RTB lên marketplace, nó sẽ xuất hiện cho mọi ví khác xem. Người mua có thể đặt mua, người bán duyệt giao dịch, và hệ thống giữ 15% hoa hồng.
                        </p>

                        <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-800/70 p-5 text-sm text-slate-300">
                            <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                <span>Pack đang chọn</span>
                                <span className="font-semibold text-white">{selectedLabel}</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between border-b border-white/10 pb-3">
                                <span>Current owner</span>
                                <span className="max-w-[220px] truncate font-semibold text-white">{defaultOwner}</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                                <span>Wallet hiện tại</span>
                                <span className="font-semibold text-white">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Chưa kết nối"}</span>
                            </div>
                        </div>

                        {connected && address && ownedRTBs.length > 0 ? (
                            <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-800/70 p-5">
                                <div className="flex items-center gap-2 text-sm font-semibold text-sky-300">
                                    <Wallet size={16} />
                                    Đăng pack lên marketplace
                                </div>

                                <label className="mt-4 block text-sm text-slate-300">
                                <span className="mb-2 block">Token ID</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={tokenId}
                                    onChange={(e) => setTokenId(Number(e.target.value || 1))}
                                    className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-3 text-white outline-none"
                                />
                            </label>

                            <label className="mt-4 block text-sm text-slate-300">
                                <span className="mb-2 block">Match ID</span>
                                <input
                                    value={matchId}
                                    onChange={(e) => setMatchId(e.target.value)}
                                    className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-3 text-white outline-none"
                                />
                            </label>

                            <label className="mt-4 block text-sm text-slate-300">
                                <span className="mb-2 block">Giá đề xuất (USDT)</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={price}
                                    onChange={(e) => setPrice(Number(e.target.value || 1))}
                                    className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-3 text-white outline-none"
                                />
                            </label>

                                <button
                                    onClick={handleCreateListing}
                                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-500/20"
                                >
                                    <Sparkles size={18} />
                                    Đăng lên marketplace
                                </button>
                            </div>
                        ) : (
                            <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-800/70 p-5 text-sm text-slate-300">
                                {connected && address
                                    ? "Ví này chưa có pack nào để đăng lên marketplace."
                                    : "Kết nối ví để xem và đăng pack lên marketplace."}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-[24px] border border-white/10 bg-slate-800/70 p-4 text-sm text-slate-300">
                            <div className="flex items-center justify-between">
                                <p className="font-semibold text-white">Danh sách marketplace</p>
                                <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-sky-300">
                                    {listings.filter((item) => item.status === "active").length} đang bán
                                </span>
                            </div>
                        </div>

                        {listings.length === 0 ? (
                            <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-8 text-center text-slate-300">
                                Chưa có pack nào trên marketplace.
                            </div>
                        ) : (
                            listings.map((listing) => (
                                <div key={listing.id} className="rounded-[24px] border border-white/10 bg-slate-900/70 p-5 text-sm text-slate-300">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-white">RTB #{listing.tokenId}</p>
                                            <p className="mt-1 text-slate-400">{listing.matchId}</p>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${listing.status === "sold" ? "bg-emerald-500/15 text-emerald-300" : listing.status === "pending" ? "bg-amber-500/15 text-amber-300" : "bg-sky-500/15 text-sky-300"}`}>
                                            {listing.status === "sold" ? "Đã bán" : listing.status === "pending" ? "Chờ duyệt" : "Đang bán"}
                                        </span>
                                    </div>

                                    <div className="mt-4 grid gap-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span>Giá</span>
                                            <span className="font-semibold text-white">{listing.price} USDT</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span>Hoa hồng 15%</span>
                                            <span className="font-semibold text-white">{listing.fee} USDT</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span>Người bán nhận</span>
                                            <span className="font-semibold text-white">{listing.sellerReceives} USDT</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span>Người bán</span>
                                            <span className="max-w-[180px] truncate font-semibold text-white">{listing.sellerAddress.slice(0, 6)}...{listing.sellerAddress.slice(-4)}</span>
                                        </div>
                                    </div>

                                    {listing.status === "active" && (
                                        <button
                                            onClick={() => handleBuy(listing)}
                                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-slate-800 px-4 py-3 font-medium text-slate-100"
                                        >
                                            <ArrowRightLeft size={16} />
                                            Mua pack
                                        </button>
                                    )}

                                    {listing.status === "pending" && address?.toLowerCase() === listing.sellerAddress.toLowerCase() && (
                                        <button
                                            onClick={() => handleApproveTransfer(listing)}
                                            disabled={loading}
                                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 font-semibold text-white"
                                        >
                                            {loading ? <Sparkles className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                            Duyệt giao dịch
                                        </button>
                                    )}
                                </div>
                            ))
                        )}

                        {message && (
                            <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300">
                                {message}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}