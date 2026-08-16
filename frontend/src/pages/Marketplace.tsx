import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Sparkles, Wallet, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import {
    getUserRTBs,
    createMarketplaceListing,
    getUSDCBalance,
    buyFromMarketplace,
    transferUSDC,
    getMarketplaceListings
} from "../services/contract";

const PAYMENT_WALLET = import.meta.env.VITE_PAYMENT_WALLET || "0x8c75a2eC18f3B5Dcca94C8aF239AcdB01109dA64";

interface Listing {
    tokenId: number;
    seller: string;
    price: number;
    active: boolean;
    matchId?: string;
}

export default function Marketplace() {
    const navigate = useNavigate();
    const { address, connected } = useWallet();

    // Seller state
    const [selectedRTB, setSelectedRTB] = useState<number | null>(null);
    const [listingPrice, setListingPrice] = useState(50);
    const [ownedRTBs, setOwnedRTBs] = useState<Array<{ tokenId: number; matchId: string }>>([]);

    // Buyer state
    const [listings, setListings] = useState<Listing[]>([]);
    const [selectedBuyListing, setSelectedBuyListing] = useState<Listing | null>(null);
    const [usdcBalance, setUsdcBalance] = useState(0);

    // UI state
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const previousWalletRef = useRef<string | null>(null);
    const previousConnectedRef = useRef(false);
    const hasInitializedWalletRef = useRef(false);

    // Initialize wallet
    useEffect(() => {
        if (!hasInitializedWalletRef.current) {
            hasInitializedWalletRef.current = true;
            previousWalletRef.current = address ?? null;
            previousConnectedRef.current = connected;
            return;
        }

        const walletChanged = previousWalletRef.current !== address || previousConnectedRef.current !== connected;
        if (!walletChanged) return;

        setOwnedRTBs([]);
        setUsdcBalance(0);
        setMessage("");
        setSelectedRTB(null);
        setSelectedBuyListing(null);

        previousWalletRef.current = address ?? null;
        previousConnectedRef.current = connected;
    }, [address, connected]);

    // Load seller's RTBs, buyer's USDC balance, and marketplace listings
    useEffect(() => {
        async function loadData() {
            if (!connected || !address) {
                setOwnedRTBs([]);
                setUsdcBalance(0);
                return;
            }

            try {
                const owned = await getUserRTBs(address);
                setOwnedRTBs(owned);

                const balance = await getUSDCBalance(address);
                setUsdcBalance(balance);

                // Load marketplace listings
                const allListings = await getMarketplaceListings();
                setListings(allListings);
            } catch (error) {
                console.error("Error loading wallet data:", error);
            }
        }

        void loadData();
    }, [address, connected]);

    // SELLER: List RTB on marketplace
    async function handleListRTB() {
        try {
            if (!connected || !address) {
                setMessage("Vui lòng kết nối ví");
                return;
            }

            if (!selectedRTB || selectedRTB < 1 || listingPrice <= 0) {
                setMessage("Vui lòng chọn RTB và nhập giá");
                return;
            }

            setLoading(true);
            setMessage("");

            // Create listing (transfers RTB to marketplace contract)
            const txHash = await createMarketplaceListing(selectedRTB, listingPrice);
            
            setMessage(`✅ RTB #${selectedRTB} đã được đăng lên Market!\nTx: ${txHash.slice(0, 12)}...`);

            // Reload RTBs and marketplace listings
            const owned = await getUserRTBs(address);
            setOwnedRTBs(owned);
            
            const allListings = await getMarketplaceListings();
            setListings(allListings);

            setSelectedRTB(null);
            setListingPrice(50);

            // Reset after 3 seconds
            setTimeout(() => {
                setMessage("");
            }, 3000);
        } catch (error: any) {
            setMessage(`❌ Lỗi: ${error?.message || "Không thể đăng listing"}`);
        } finally {
            setLoading(false);
        }
    }

    // BUYER: Buy RTB from marketplace
    async function handleBuyRTB() {
        try {
            if (!connected || !address || !selectedBuyListing) {
                setMessage("Vui lòng kết nối ví");
                return;
            }

            if (usdcBalance < selectedBuyListing.price) {
                setMessage(`❌ USDC không đủ. Cần ${selectedBuyListing.price} USDC`);
                return;
            }

            setLoading(true);
            setMessage("");

            // Step 1: Transfer USDC to payment wallet
            setMessage(`Đang chuyển ${selectedBuyListing.price} USDC...`);
            await transferUSDC(PAYMENT_WALLET, selectedBuyListing.price);

            // Step 2: Buy RTB from marketplace
            setMessage("Đang ký giao dịch mua RTB...");
            const txHash = await buyFromMarketplace(selectedBuyListing.tokenId);

            setMessage(`✅ Mua thành công! RTB #${selectedBuyListing.tokenId} của bạn rồi!\nTx: ${txHash.slice(0, 12)}...`);

            // Reload balance and marketplace listings
            const balance = await getUSDCBalance(address);
            setUsdcBalance(balance);

            const allListings = await getMarketplaceListings();
            setListings(allListings);

            setSelectedBuyListing(null);

            setTimeout(() => {
                setMessage("");
            }, 3000);
        } catch (error: any) {
            setMessage(`❌ Lỗi: ${error?.message || "Không thể mua RTB"}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto min-h-[70vh] max-w-6xl px-4 py-8">
            <div className="rounded-[32px] border border-white/10 bg-slate-900/75 p-8 shadow-2xl">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                >
                    <ArrowLeft size={16} />
                    Quay lại
                </button>

                {/* SELLER SECTION */}
                <div className="mt-8">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <Sparkles className="text-yellow-400" size={28} />
                            Đăng RTB lên Market
                        </h2>
                        <p className="text-sm text-slate-400 mt-2">
                            Chọn RTB của bạn → Nhập giá → Đăng lên marketplace
                        </p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        {/* Select RTB */}
                        <div className="rounded-lg border border-yellow-400/20 bg-yellow-500/5 p-4">
                            <label className="block text-sm font-medium text-yellow-300 mb-3">
                                RTB của bạn
                            </label>
                            {ownedRTBs.length > 0 ? (
                                <select
                                    value={selectedRTB || ""}
                                    onChange={(e) => setSelectedRTB(Number(e.target.value) || null)}
                                    className="w-full rounded-lg border border-yellow-400/30 bg-slate-800 px-3 py-2 text-white focus:border-yellow-400 focus:outline-none"
                                >
                                    <option value="">-- Chọn RTB --</option>
                                    {ownedRTBs.map((rtb) => (
                                        <option key={rtb.tokenId} value={rtb.tokenId}>
                                            RTB #{rtb.tokenId} ({rtb.matchId})
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="text-sm text-slate-400 py-2">Không có RTB nào</div>
                            )}
                        </div>

                        {/* Input Price */}
                        <div className="rounded-lg border border-yellow-400/20 bg-yellow-500/5 p-4">
                            <label className="block text-sm font-medium text-yellow-300 mb-3">
                                Giá bán (USDC)
                            </label>
                            <input
                                type="number"
                                value={listingPrice}
                                onChange={(e) => setListingPrice(Number(e.target.value))}
                                min="0"
                                step="0.1"
                                className="w-full rounded-lg border border-yellow-400/30 bg-slate-800 px-3 py-2 text-white focus:border-yellow-400 focus:outline-none"
                            />
                        </div>

                        {/* Price Breakdown */}
                        <div className="rounded-lg border border-yellow-400/20 bg-yellow-500/5 p-4">
                            <p className="text-sm text-yellow-300 font-medium mb-2">Chi tiết giá</p>
                            {listingPrice > 0 ? (
                                <div className="text-sm text-slate-300 space-y-1">
                                    <p>Seller: {(listingPrice * 0.85).toFixed(2)} USDC</p>
                                    <p className="text-orange-400">Fee (15%): {(listingPrice * 0.15).toFixed(2)} USDC</p>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500">Nhập giá để xem chi tiết</p>
                            )}
                        </div>
                    </div>

                    {/* List Button */}
                    <button
                        onClick={handleListRTB}
                        disabled={loading || !connected || !selectedRTB}
                        className="mt-4 w-full rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-3 font-semibold text-white hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                Đang đăng...
                            </>
                        ) : (
                            <>
                                <Sparkles size={18} />
                                Đăng lên Market
                            </>
                        )}
                    </button>

                    {message && (
                        <div className={`mt-4 rounded-lg border p-3 text-sm font-medium whitespace-pre-line ${
                            message.includes("✅")
                                ? "border-yellow-400/30 bg-yellow-500/10 text-yellow-300"
                                : "border-red-400/30 bg-red-500/10 text-red-300"
                        }`}>
                            {message}
                        </div>
                    )}
                </div>

                {/* BUYER SECTION */}
                <div className="mt-12 border-t border-white/10 pt-12">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <ShoppingCart className="text-emerald-400" size={28} />
                            Mua RTB từ Market
                        </h2>
                        <p className="text-sm text-slate-400 mt-2">
                            USDC Balance: <span className="text-emerald-300 font-semibold">{usdcBalance.toFixed(2)} USDC</span>
                        </p>
                    </div>

                    {selectedBuyListing ? (
                        // Buy confirmation
                        <div className="max-w-md rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-6">
                            <h3 className="text-lg font-bold text-emerald-300 mb-4">
                                Xác nhận mua RTB #{selectedBuyListing.tokenId}
                            </h3>

                            <div className="space-y-2 rounded-lg bg-slate-800/50 p-4 mb-4 text-sm">
                                <p className="text-slate-400">Seller: <span className="text-slate-200">{selectedBuyListing.seller.slice(0, 6)}...</span></p>
                                <p className="text-slate-400">Giá: <span className="text-emerald-300 font-semibold">{selectedBuyListing.price} USDC</span></p>
                                <p className="text-slate-400">Bạn sẽ chuyển: 
                                    <span className="text-emerald-300 font-semibold block mt-1">
                                        {selectedBuyListing.price} USDC
                                    </span>
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleBuyRTB}
                                    disabled={loading || usdcBalance < selectedBuyListing.price}
                                    className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 font-semibold text-white hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="animate-spin" size={18} />
                                            Đang mua...
                                        </>
                                    ) : (
                                        <>
                                            <Wallet size={18} />
                                            Xác nhận mua
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setSelectedBuyListing(null)}
                                    disabled={loading}
                                    className="flex-1 rounded-lg border border-slate-400/30 bg-slate-800 px-4 py-3 font-semibold text-slate-300 hover:bg-slate-700"
                                >
                                    Hủy
                                </button>
                            </div>

                            {message && (
                                <div className={`mt-4 rounded-lg border p-3 text-sm font-medium whitespace-pre-line ${
                                    message.includes("✅")
                                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                                        : "border-red-400/30 bg-red-500/10 text-red-300"
                                }`}>
                                    {message}
                                </div>
                            )}
                        </div>
                    ) : (
                        // List of marketplace listings
                        <div>
                            {listings.length > 0 ? (
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {listings.map((listing) => (
                                        <div
                                            key={listing.tokenId}
                                            onClick={() => setSelectedBuyListing(listing)}
                                            className="cursor-pointer rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-4 hover:border-emerald-400/50 hover:bg-emerald-500/10 transition"
                                        >
                                            <div className="space-y-2">
                                                <p className="text-sm text-slate-400">RTB ID</p>
                                                <p className="text-lg font-bold text-emerald-300">#{listing.tokenId}</p>
                                                
                                                <div className="border-t border-white/10 pt-3 mt-3">
                                                    <p className="text-sm text-slate-400">Match</p>
                                                    <p className="text-sm font-semibold text-slate-200">{listing.matchId || "Unknown"}</p>
                                                </div>

                                                <div className="border-t border-white/10 pt-3">
                                                    <p className="text-sm text-slate-400">Seller</p>
                                                    <p className="text-sm font-mono text-slate-200 truncate">{listing.seller.slice(0, 10)}...</p>
                                                </div>

                                                <div className="border-t border-white/10 pt-3">
                                                    <p className="text-sm text-slate-400">Giá</p>
                                                    <p className="text-lg font-bold text-emerald-300">{listing.price.toFixed(2)} USDC</p>
                                                </div>

                                                <button
                                                    className="mt-4 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2 text-sm font-semibold text-white hover:from-emerald-600 hover:to-teal-600"
                                                >
                                                    Mua
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-slate-400 py-8">
                                    <p className="text-sm">Không có listing nào trên market.</p>
                                    <p className="text-sm mt-1">Đăng RTB của bạn lên trên để bán!</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {!connected && (
                    <div className="mt-8 rounded-lg border border-yellow-400/20 bg-yellow-500/10 p-4 text-center text-sm text-yellow-300 font-medium">
                        Kết nối ví để bắt đầu mua và bán RTB
                    </div>
                )}
            </div>
        </div>
    );
}
