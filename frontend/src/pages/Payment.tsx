import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import { createOrder, submitRedeemTx, verifyPayment } from "../services/api";
import { redeemRTB, transferUSDC } from "../services/contract";
import { matches as defaultMatches } from "../data/matches";

const PACK_PURCHASE_HISTORY_KEY = "fifa-pack-purchase-history";
const AVALANCHE_FUJI_EXPLORER = "https://testnet.snowtrace.io/tx";
const HIDDEN_REDEEMED_RTBS_KEY = "hidden-redeemed-rtbs";

function recordPackPurchase(walletAddress: string, matchId: string) {
    try {
        const raw = localStorage.getItem(PACK_PURCHASE_HISTORY_KEY);
        const history = raw ? JSON.parse(raw) : {};
        const walletKey = walletAddress.toLowerCase();
        const matchCounts = history[walletKey] ?? {};
        const nextCount = Number(matchCounts[matchId] ?? 0) + 1;

        history[walletKey] = {
            ...matchCounts,
            [matchId]: nextCount
        };

        localStorage.setItem(PACK_PURCHASE_HISTORY_KEY, JSON.stringify(history));
    } catch {
        // Ignore malformed local storage history.
    }
}

function markRedeemedRTB(tokenId: number) {
    try {
        const raw = localStorage.getItem(HIDDEN_REDEEMED_RTBS_KEY);
        const hidden: number[] = raw ? JSON.parse(raw) : [];
        const next = Array.from(new Set([...hidden, tokenId]));
        localStorage.setItem(HIDDEN_REDEEMED_RTBS_KEY, JSON.stringify(next));
    } catch {
        // Ignore malformed local storage values.
    }
}

interface MatchOption {
    matchId: string;
    teamA: string;
    teamB: string;
    date: string;
    stadium: string;
    category: string;
}

interface PaymentLocationState {
    purchaseMode?: "pack" | "rtb-right";
    match?: MatchOption;
    rtbTokenId?: number;
}

type CheckoutStep = "checkout" | "payment" | "verification" | "minting" | "success";

export default function Payment() {
    const navigate = useNavigate();
    const location = useLocation();
    const { address, connected } = useWallet();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<CheckoutStep>("checkout");
    const [message, setMessage] = useState("");
    const [paymentTxHash, setPaymentTxHash] = useState("");
    const [mintTxHash, setMintTxHash] = useState("");
    const [rtbTokenId, setRtbTokenId] = useState<number | null>(null);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [seat, setSeat] = useState("");

    const paymentState = (location.state as PaymentLocationState | null) ?? {};
    const purchaseMode = paymentState.purchaseMode ?? "pack";
    const selectedMatch = useMemo(() => {
        return paymentState.match ?? defaultMatches[0];
    }, [paymentState.match]);

    const isRtbRightFlow = purchaseMode === "rtb-right";
    const pageTitle = isRtbRightFlow ? "Sử dụng quyền mua RTB" : "Thanh toán pack RTB";
    const successTitle = isRtbRightFlow ? "Sử dụng quyền mua RTB thành công" : "Mua pack RTB thành công";
    const successSubtitle = isRtbRightFlow
        ? `Bạn đã nhận RTB cho trận ${selectedMatch.teamA} vs ${selectedMatch.teamB}.`
        : `Bạn đã nhận RTB cho trận ${selectedMatch.teamA} vs ${selectedMatch.teamB}.`;

    async function handleConfirmPayment() {
        try {
            if (!connected) {
                setMessage("Vui lòng kết nối ví bằng nút Connect Wallet ở góc trên bên phải.");
                return;
            }

            if (!address) {
                setMessage("Wallet chưa được kết nối");
                return;
            }

            setLoading(true);
            setMessage("");
            setPaymentTxHash("");
            setMintTxHash("");
            setRtbTokenId(null);

            if (isRtbRightFlow && (paymentState as PaymentLocationState).rtbTokenId) {
                // RTB-RIGHT FLOW (existing redeem flow)
                setStep("minting");
                const rtbTokenId = (paymentState as PaymentLocationState).rtbTokenId as number;
                const orderPayload = {
                    userAddress: address,
                    rtbTokenId,
                    matchId: selectedMatch.matchId,
                    category: selectedMatch.category,
                    seat: seat || "",
                    price: 20
                };

                const orderResp = await createOrder(orderPayload);
                const txHash = await redeemRTB(rtbTokenId);
                await submitRedeemTx(txHash);
                markRedeemedRTB(rtbTokenId);

                const purchasePayload = {
                    matchId: selectedMatch.matchId,
                    label: `${selectedMatch.teamA} vs ${selectedMatch.teamB}`,
                    purchaseMode,
                    seat: seat || "",
                    orderId: orderResp?.data?.orderId || orderResp?.orderId
                };

                localStorage.setItem("lastPurchasedRTB", JSON.stringify(purchasePayload));
                setMintTxHash(txHash);
                setMessage(`Bạn đã sử dụng quyền mua RTB thành công cho ${selectedMatch.teamA} vs ${selectedMatch.teamB}. RTT đã được mint vào ví của bạn.`);
                setStep("success");
            } else {
                // PACK FLOW (new USDC payment flow)
                const PACK_PRICE = 20; // USDC
                const paymentWallet = import.meta.env.VITE_PAYMENT_WALLET;

                // Step 1: Transfer USDC
                setStep("payment");
                setMessage("Đang chuyển USDC từ ví của bạn...");

                const paymentTx = await transferUSDC(paymentWallet, PACK_PRICE);
                setPaymentTxHash(paymentTx);
                setMessage("USDC đã được chuyển. Đang xác minh thanh toán trên blockchain...");

                // Step 2: Verify payment with backend
                setStep("verification");
                const verifyResult = await verifyPayment(address, selectedMatch.matchId, paymentTx, PACK_PRICE);

                setPaymentTxHash(verifyResult.paymentTxHash);
                setRtbTokenId(verifyResult.rtbTokenId);
                setMintTxHash(verifyResult.mintTxHash);

                const purchasePayload = {
                    matchId: selectedMatch.matchId,
                    label: `${selectedMatch.teamA} vs ${selectedMatch.teamB}`,
                    purchaseMode,
                    orderId: verifyResult.orderId
                };

                localStorage.setItem("lastPurchasedRTB", JSON.stringify(purchasePayload));
                recordPackPurchase(address, selectedMatch.matchId);

                setMessage(`Mua pack RTB thành công cho ${selectedMatch.teamA} vs ${selectedMatch.teamB}.`);
                setStep("success");
            }
        } catch (error: any) {
            setStep("checkout");
            const resp = error?.response;
            if (resp && resp.status === 401) {
                setMessage(
                    "Unauthorized: backend API key missing or invalid. Set API_KEY (backend) and VITE_API_KEY (frontend)."
                );
            } else {
                setMessage(resp?.data?.message || error.message || "Thanh toán không thành công");
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto max-w-2xl rounded-[32px] border border-white/10 bg-slate-900/75 p-8 shadow-2xl shadow-blue-950/30 backdrop-blur">
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-sm text-slate-300"
            >
                <ArrowLeft size={16} />
                Quay lại
            </button>

            <div className="mt-6 text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Checkout</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">{pageTitle}</h2>
                <p className="mt-3 text-slate-400">
                    {isRtbRightFlow
                        ? "Sử dụng quyền mua RTB của bạn để nhận ngay NFT cho trận đã chọn."
                        : "Xác nhận thanh toán để nhận RTB NFT cho trận đấu bạn đã chọn."}
                </p>
            </div>

            {step === "checkout" && (
                <div className="mt-8 space-y-6">
                    <div className="rounded-2xl border border-white/10 bg-slate-800/80 p-5 text-sm text-slate-300">
                        <div className="flex items-center justify-between border-b border-white/10 py-3">
                            <span>Pack</span>
                            <span className="font-semibold text-white">{isRtbRightFlow ? "RTB quyền mua" : "RTB NFT"}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-white/10 py-3">
                            <span>Trận đấu</span>
                            <span className="font-semibold text-white">{selectedMatch.teamA} vs {selectedMatch.teamB}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-white/10 py-3">
                            <span>Ngày</span>
                            <span className="font-semibold text-white">{selectedMatch.date}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-white/10 py-3">
                            <span>Stadium</span>
                            <span className="font-semibold text-white">{selectedMatch.stadium}</span>
                        </div>
                        <div className="flex items-center justify-between py-3">
                            <span>Giá</span>
                            <span className="font-semibold text-white">$20</span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-4 text-sm text-slate-300">
                        <p className="mb-2 font-semibold text-white">Thông tin thanh toán</p>
                        <div className="grid gap-3">
                            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Họ và tên" className="rounded-lg bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-400" />
                            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-lg bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-400" />
                            {isRtbRightFlow && (
                                <input value={seat} onChange={(e) => setSeat(e.target.value)} placeholder="Chỗ ngồi (ví dụ: A12)" className="rounded-lg bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-400" />
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                        <p className="font-semibold text-white">
                            {isRtbRightFlow ? "Thanh toán bằng quyền mua RTB" : "Thanh toán bằng ví của bạn"}
                        </p>
                        <p className="mt-1 text-emerald-50/90">
                            {isRtbRightFlow
                                ? "Sau khi xác nhận, RTB sẽ được mint và hiện trong My Collect."
                                : "Sau khi xác nhận, RTB sẽ được mint và hiện trong My Collect."}
                        </p>
                    </div>

                    <button
                        onClick={handleConfirmPayment}
                        disabled={loading}
                        className="flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 py-4 font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:scale-[1.01]"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" />
                                Đang xử lý...
                            </>
                        ) : (
                            <>
                                <Sparkles size={18} />
                                {isRtbRightFlow ? "Xác nhận sử dụng quyền mua" : "Xác nhận thanh toán"}
                            </>
                        )}
                    </button>
                </div>
            )}

            {step === "payment" && (
                <div className="mt-8 rounded-2xl border border-white/10 bg-slate-800/80 p-6 text-center text-slate-300">
                    <Loader2 className="mx-auto animate-spin text-sky-300" size={32} />
                    <p className="mt-4 text-lg font-semibold text-white">Đang chuyển USDC...</p>
                    <p className="mt-2 text-sm text-slate-400">
                        Vui lòng xác nhận giao dịch trong MetaMask.
                    </p>
                </div>
            )}

            {step === "verification" && (
                <div className="mt-8 rounded-2xl border border-white/10 bg-slate-800/80 p-6 text-center text-slate-300">
                    <Loader2 className="mx-auto animate-spin text-sky-300" size={32} />
                    <p className="mt-4 text-lg font-semibold text-white">Đang xác minh thanh toán...</p>
                    <p className="mt-2 text-sm text-slate-400">
                        Hệ thống đang kiểm tra thanh toán USDC trên blockchain.
                    </p>
                </div>
            )}

            {step === "minting" && (
                <div className="mt-8 rounded-2xl border border-white/10 bg-slate-800/80 p-6 text-center text-slate-300">
                    <Loader2 className="mx-auto animate-spin text-sky-300" size={32} />
                    <p className="mt-4 text-lg font-semibold text-white">Đang mint RTB...</p>
                    <p className="mt-2 text-sm text-slate-400">
                        Hệ thống đang ký giao dịch RTB trên blockchain cho trận {selectedMatch.teamA} vs {selectedMatch.teamB}.
                    </p>
                </div>
            )}

            {step === "success" && (
                <div className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-6 text-center text-slate-300">
                    <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
                    <p className="mt-4 text-xl font-semibold text-white">{successTitle}</p>
                    <p className="mt-2 text-sm text-slate-300">{successSubtitle}</p>
                    
                    <div className="mt-6 space-y-4">
                        {/* Payment transaction for pack flow */}
                        {!isRtbRightFlow && paymentTxHash && (
                            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-left">
                                <p className="text-sm font-semibold text-white mb-2">💰 Giao dịch thanh toán USDC</p>
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs text-sky-300 break-all">{paymentTxHash}</p>
                                    <a
                                        href={`${AVALANCHE_FUJI_EXPLORER}/${paymentTxHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition text-xs"
                                    >
                                        <ExternalLink size={12} />
                                        Explorer
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* RTB Token ID and Mint transaction */}
                        {rtbTokenId !== null && mintTxHash && (
                            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-left">
                                <p className="text-sm font-semibold text-white mb-3">🎫 RTB Token</p>
                                <div className="mb-3 p-3 rounded-lg bg-slate-800/50 border border-white/5">
                                    <p className="text-xs text-slate-400 mb-1">Token ID</p>
                                    <p className="text-lg font-semibold text-emerald-300">{rtbTokenId}</p>
                                </div>
                                <p className="text-xs text-slate-400 mb-2">Giao dịch mint:</p>
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs text-sky-300 break-all">{mintTxHash}</p>
                                    <a
                                        href={`${AVALANCHE_FUJI_EXPLORER}/${mintTxHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition text-xs"
                                    >
                                        <ExternalLink size={12} />
                                        Explorer
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* RTB-Right flow - only mint tx */}
                        {isRtbRightFlow && mintTxHash && (
                            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-left">
                                <p className="text-sm font-semibold text-white mb-2">🎫 Giao dịch mint RTT</p>
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs text-sky-300 break-all">{mintTxHash}</p>
                                    <a
                                        href={`${AVALANCHE_FUJI_EXPLORER}/${mintTxHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition text-xs"
                                    >
                                        <ExternalLink size={12} />
                                        Explorer
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-left text-sm text-slate-300">
                        <p>{message}</p>
                    </div>

                    <button
                        onClick={() => navigate(isRtbRightFlow ? "/ticket" : "/collection")}
                        className="mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20"
                    >
                        {isRtbRightFlow ? "Xem My Tickets" : "Xem My Collect"}
                    </button>
                </div>
            )}

            {message && step === "checkout" && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-slate-800/70 p-4 text-sm text-slate-300">
                    <p>{message}</p>
                </div>
            )}
        </div>
    );
}
