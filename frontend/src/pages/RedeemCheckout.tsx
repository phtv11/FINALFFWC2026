import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import { createOrder, submitRedeemTx, verifyPayment } from "../services/api";
import { redeemRTB, transferUSDC } from "../services/contract";
import { matches as defaultMatches } from "../data/matches";

const HIDDEN_REDEEMED_RTBS_KEY = "hidden-redeemed-rtbs";
const REDEEM_FEE_USDC = 20; // 20 USDC for redeem
const PAYMENT_WALLET = import.meta.env.VITE_PAYMENT_WALLET || "0x8c75a2eC18f3B5Dcca94C8aF239AcdB01109dA64";

function markRedeemedRTB(tokenId: number) {
    try {
        const raw = localStorage.getItem(HIDDEN_REDEEMED_RTBS_KEY);
        const hidden: number[] = raw ? JSON.parse(raw) : [];
        const next = Array.from(new Set([...hidden, tokenId]));
        localStorage.setItem(HIDDEN_REDEEMED_RTBS_KEY, JSON.stringify(next));
    } catch {
        // Ignore malformed storage values.
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

interface RedeemLocationState {
    match?: MatchOption;
    rtbTokenId?: number;
}

type CheckoutStep = "checkout" | "processing_payment" | "payment_verified" | "processing_redeem" | "success";

export default function RedeemCheckout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { address, connected } = useWallet();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<CheckoutStep>("checkout");
    const [message, setMessage] = useState("");
    const [txHash, setTxHash] = useState("");
    const [seat, setSeat] = useState("");
    const [paymentTxHash, setPaymentTxHash] = useState("");

    const redeemState = (location.state as RedeemLocationState | null) ?? {};
    const selectedMatch = useMemo(() => {
        return redeemState.match ?? defaultMatches[0];
    }, [redeemState.match]);

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

            const rtbTokenId = redeemState.rtbTokenId;
            if (!rtbTokenId && rtbTokenId !== 0) {
                setMessage("Không tìm thấy RTB để redeem");
                return;
            }

            if (!seat.trim()) {
                setMessage("Vui lòng nhập chỗ ngồi");
                return;
            }

            setLoading(true);
            setMessage("");
            setTxHash("");
            setPaymentTxHash("");
            setStep("processing_payment");

            // Step 1: Transfer USDC to Payment Wallet
            console.log(`[REDEEM] Starting USDC payment (${REDEEM_FEE_USDC} USDC)...`);
            const usdcTxHash = await transferUSDC(PAYMENT_WALLET, REDEEM_FEE_USDC);
            setPaymentTxHash(usdcTxHash);
            setMessage(`USDC payment sent: ${usdcTxHash.slice(0, 12)}...`);

            // Step 2: Verify USDC payment with backend
            console.log(`[REDEEM] Verifying USDC payment...`);
            setStep("payment_verified");
            setMessage("Verifying USDC payment...");
            
            const verifyResult = await verifyPayment(
                address,
                selectedMatch.matchId,
                usdcTxHash,
                REDEEM_FEE_USDC
            );
            console.log("[REDEEM] Payment verified:", verifyResult);
            setMessage("Payment verified! Processing redeem...");

            // Step 3: Call redeem contract function
            console.log(`[REDEEM] Calling redeem(${rtbTokenId})...`);
            setStep("processing_redeem");
            setMessage("Processing redeem on blockchain...");
            
            const redeemTxHash = await redeemRTB(rtbTokenId);
            setTxHash(redeemTxHash);
            setMessage(`Redeem successful: ${redeemTxHash.slice(0, 12)}...`);

            // Step 4: Create order
            const orderPayload = {
                userAddress: address,
                rtbTokenId,
                matchId: selectedMatch.matchId,
                category: selectedMatch.category || "Standard",
                seat: seat.trim(),
                price: REDEEM_FEE_USDC
            };
            await createOrder(orderPayload);

            // Step 5: Submit redeem tx to backend
            console.log(`[REDEEM] Submitting redeem tx to backend...`);
            await submitRedeemTx(redeemTxHash);
            
            markRedeemedRTB(rtbTokenId);

            const purchasePayload = {
                matchId: selectedMatch.matchId,
                label: `${selectedMatch.teamA} vs ${selectedMatch.teamB}`,
                purchaseMode: "rtb-right",
                seat: seat.trim(),
                orderId: `REDEEM_${Date.now()}`
            };

            localStorage.setItem("lastPurchasedRTB", JSON.stringify(purchasePayload));
            setMessage(`Bạn đã sử dụng quyền mua RTB thành công cho ${selectedMatch.teamA} vs ${selectedMatch.teamB}. RTT đã được mint vào ví của bạn.`);
            setStep("success");
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
                <h2 className="mt-2 text-3xl font-semibold text-white">Sử dụng quyền mua RTB</h2>
                <p className="mt-3 text-slate-400">
                    Sử dụng quyền mua RTB của bạn để đổi lấy RTT cho trận đã chọn.
                </p>
            </div>

            {step === "checkout" && (
                <div className="mt-8 space-y-6">
                    <div className="rounded-2xl border border-white/10 bg-slate-800/80 p-5 text-sm text-slate-300">
                        <div className="flex items-center justify-between border-b border-white/10 py-3">
                            <span>Thẻ</span>
                            <span className="font-semibold text-white">RTB quyền mua</span>
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
                            <span>Phí Redeem (USDC)</span>
                            <span className="font-semibold text-white">{REDEEM_FEE_USDC} USDC</span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-4 text-sm text-slate-300">
                        <p className="mb-2 font-semibold text-white">Thông tin thanh toán</p>
                        <div className="grid gap-3">
                            <input
                                value={seat}
                                onChange={(e) => setSeat(e.target.value)}
                                placeholder="Chỗ ngồi (ví dụ: A12)"
                                className="rounded-lg bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                        <p className="font-semibold text-white">Thanh toán bằng USDC</p>
                        <p className="mt-1 text-emerald-50/90">
                            Bạn sẽ chuyển {REDEEM_FEE_USDC} USDC. Sau khi thanh toán xác nhận, RTB sẽ bị xóa và RTT sẽ hiện trên trang Ticket.
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
                                Thanh toán & Redeem
                            </>
                        )}
                    </button>
                </div>
            )}

            {(step === "processing_payment" || step === "payment_verified" || step === "processing_redeem") && (
                <div className="mt-8 rounded-2xl border border-white/10 bg-slate-800/80 p-6 text-center text-slate-300">
                    <Loader2 className="mx-auto animate-spin text-sky-300" size={32} />
                    <p className="mt-4 text-lg font-semibold text-white">
                        {step === "processing_payment" && "Xử lý thanh toán USDC..."}
                        {step === "payment_verified" && "Xác minh thanh toán..."}
                        {step === "processing_redeem" && "Đang redeem RTB..."}
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                        {step === "processing_payment" && "Chuyển USDC tới ví thanh toán..."}
                        {step === "payment_verified" && "Kiểm tra thanh toán trên blockchain..."}
                        {step === "processing_redeem" && "Đang burn RTB và mint RTT..."}
                    </p>
                    {message && (
                        <p className="mt-3 text-xs text-sky-300">
                            {message}
                        </p>
                    )}
                    {paymentTxHash && (
                        <p className="mt-2 break-all text-xs text-slate-400">
                            Payment Tx: {paymentTxHash.slice(0, 20)}...
                        </p>
                    )}
                </div>
            )}

            {step === "success" && (
                <div className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-6 text-center text-slate-300">
                    <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
                    <p className="mt-4 text-xl font-semibold text-white">Sử dụng quyền mua RTB thành công</p>
                    <p className="mt-2 text-sm text-slate-300">
                        Bạn đã nhận RTT cho trận {selectedMatch.teamA} vs {selectedMatch.teamB}.
                    </p>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-left text-sm text-slate-300">
                        <p>{message}</p>
                        {txHash && <p className="mt-2 break-all text-xs text-sky-300">Redeem Tx: {txHash}</p>}
                        {paymentTxHash && <p className="mt-1 break-all text-xs text-slate-400">Payment Tx: {paymentTxHash}</p>}
                    </div>
                    <button
                        onClick={() => navigate("/ticket")}
                        className="mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20"
                    >
                        Xem My Tickets
                    </button>
                </div>
            )}
        </div>
    );
}
