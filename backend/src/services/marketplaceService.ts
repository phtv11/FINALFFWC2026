import { ethers } from "ethers";
import dotenv from "dotenv";
import { provider } from "../config/blockchain";
import * as marketplaceRepo from "../repositories/marketplaceListingRepository";
import * as rtbService from "./rtbService";
import RTB from "../contracts/FIFARTB.json";

dotenv.config({ override: true });

// ================================
// Create Listing
// ================================

export async function createListing(
    sellerAddress: string,
    tokenId: number,
    matchId: string,
    price: number
) {
    if (!sellerAddress) throw new Error("Thiếu địa chỉ người bán");
    if (!tokenId || tokenId < 1) throw new Error("Token ID không hợp lệ");
    if (!matchId || matchId.trim().length === 0) throw new Error("Match ID không hợp lệ");
    if (price <= 0) throw new Error("Giá không hợp lệ");

    // Verify seller owns the RTB token on-chain
    console.log(`[MARKETPLACE] Verifying seller owns RTB #${tokenId}`);
    
    try {
        const owner = await rtbService.ownerOf(tokenId);
        if (owner.toLowerCase() !== sellerAddress.toLowerCase()) {
            throw new Error(`Seller không sở hữu RTB #${tokenId}. Owner hiện tại: ${owner}`);
        }
    } catch (error) {
        throw new Error(`Không thể xác minh sở hữu RTB: ${error}`);
    }

    // Check if token is already listed
    const existingListing = await marketplaceRepo.findListingByTokenId(tokenId);
    if (existingListing && existingListing.status !== "sold" && existingListing.status !== "cancelled") {
        throw new Error(`RTB #${tokenId} đã được đăng trên marketplace`);
    }

    // Create listing
    const listingId = `LISTING_${Date.now()}_${tokenId}`;
    const listing = await marketplaceRepo.createListing({
        id: listingId,
        tokenId,
        matchId,
        sellerAddress,
        price,
        status: "active"
    });

    console.log(`[MARKETPLACE] ✓ Listing created: ${listingId}`);
    return listing;
}

// ================================
// Get Active Listings
// ================================

export async function getActiveListings() {
    return await marketplaceRepo.findActiveListings();
}

export async function getListingById(id: string) {
    return await marketplaceRepo.findListingById(id);
}

// ================================
// Handle Purchase (Record Payment)
// ================================

export async function handlePurchase(
    listingId: string,
    buyerAddress: string,
    paymentTxHash: string
) {
    if (!listingId) throw new Error("Listing ID không hợp lệ");
    if (!buyerAddress) throw new Error("Địa chỉ buyer không hợp lệ");
    if (!paymentTxHash) throw new Error("Payment transaction hash không hợp lệ");

    const listing = await marketplaceRepo.findListingById(listingId);
    if (!listing) {
        throw new Error("Listing không tồn tại");
    }

    if (listing.status === "sold") {
        throw new Error("Listing đã được bán");
    }

    if (listing.status === "cancelled") {
        throw new Error("Listing đã bị hủy");
    }

    if (buyerAddress.toLowerCase() === listing.sellerAddress.toLowerCase()) {
        throw new Error("Người bán không được mua listing của chính mình");
    }

    // Update listing to pending, record buyer and payment tx
    const updated = await marketplaceRepo.updateListingStatus(listingId, "pending", {
        buyerAddress,
        paymentTxHash
    });

    console.log(`[MARKETPLACE] Purchase initiated for listing ${listingId}`);
    return updated;
}

// ================================
// Verify USDC Payment
// ================================

async function verifyUSDCPaymentForMarketplace(
    paymentTxHash: string,
    expectedAmount: number,
    buyerAddress: string
) {
    if (!paymentTxHash) {
        throw new Error("Thiếu payment transaction hash");
    }

    if (expectedAmount <= 0) {
        throw new Error("Số tiền không hợp lệ");
    }

    // Get config from environment
    const USDC_ADDRESS = process.env.USDC_ADDRESS;
    const PAYMENT_WALLET = process.env.PAYMENT_WALLET;
    const USDC_DECIMALS = parseInt(process.env.USDC_DECIMALS || "6");

    if (!USDC_ADDRESS || !PAYMENT_WALLET) {
        throw new Error("USDC configuration không hoàn chỉnh");
    }

    console.log(`[MARKETPLACE] Verifying USDC payment: ${paymentTxHash}`);

    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(paymentTxHash);
    if (!receipt) {
        throw new Error("USDC transaction chưa được xác nhận");
    }

    if (!receipt.status) {
        throw new Error("USDC transaction thất bại");
    }

    // USDC.e on Avalanche Fuji uses custom Transfer event signature
    const transferEventSignature = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const expectedAmount_uint256 = BigInt(expectedAmount) * BigInt(10 ** USDC_DECIMALS);

    let foundTransfer = false;
    let transferFrom: string | undefined;

    // Iterate through logs to find USDC Transfer event
    for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];

        // Check if log is from USDC contract
        if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
            continue;
        }

        // Check if log is Transfer event
        if (log.topics[0] !== transferEventSignature) {
            continue;
        }

        // Parse Transfer event
        const from = "0x" + log.topics[1].slice(-40);
        const to = "0x" + log.topics[2].slice(-40);
        const transferAmount = BigInt(log.data);

        // Verify receiver = PAYMENT_WALLET
        if (to.toLowerCase() !== PAYMENT_WALLET.toLowerCase()) {
            continue;
        }

        // Verify amount
        if (transferAmount !== expectedAmount_uint256) {
            continue;
        }

        // Verify sender = buyer
        if (from.toLowerCase() !== buyerAddress.toLowerCase()) {
            continue;
        }

        // All checks passed
        transferFrom = from;
        foundTransfer = true;
        break;
    }

    if (!foundTransfer) {
        throw new Error(
            `USDC transfer not found: expected ${expectedAmount} USDC from ${buyerAddress} to ${PAYMENT_WALLET}`
        );
    }

    console.log(`[MARKETPLACE] ✓ USDC payment verified`);
    return true;
}

export async function verifyPaymentAndUpdateListing(
    listingId: string,
    paymentTxHash: string
) {
    if (!listingId) throw new Error("Listing ID không hợp lệ");
    if (!paymentTxHash) throw new Error("Payment transaction hash không hợp lệ");

    const listing = await marketplaceRepo.findListingById(listingId);
    if (!listing) {
        throw new Error("Listing không tồn tại");
    }

    if (listing.status !== "pending") {
        throw new Error("Listing không ở trạng thái pending");
    }

    if (!listing.buyerAddress) {
        throw new Error("Buyer address không tồn tại");
    }

    // Verify payment
    await verifyUSDCPaymentForMarketplace(paymentTxHash, listing.price, listing.buyerAddress);

    // Update listing: mark payment as verified
    const updated = await marketplaceRepo.updateListingStatus(listingId, "pending", {
        paymentTxHash: listing.paymentTxHash,
        paymentVerifiedAt: new Date()
    });

    console.log(`[MARKETPLACE] ✓ Payment verified for listing ${listingId}`);
    return updated;
}

// ================================
// Confirm RTB Transfer
// ================================

export async function confirmRTBTransferAndMarkSold(
    listingId: string,
    transferTxHash: string
) {
    if (!listingId) throw new Error("Listing ID không hợp lệ");
    if (!transferTxHash) throw new Error("Transfer transaction hash không hợp lệ");

    const listing = await marketplaceRepo.findListingById(listingId);
    if (!listing) {
        throw new Error("Listing không tồn tại");
    }

    if (listing.status !== "pending") {
        throw new Error("Listing không ở trạng thái pending");
    }

    if (!listing.paymentVerifiedAt) {
        throw new Error("Payment chưa được xác minh");
    }

    if (!listing.buyerAddress) {
        throw new Error("Buyer address không tồn tại");
    }

    // Verify transfer event
    console.log(`[MARKETPLACE] Verifying RTB transfer: ${transferTxHash}`);

    const receipt = await provider.getTransactionReceipt(transferTxHash);
    if (!receipt) {
        throw new Error("Transfer transaction chưa được xác nhận");
    }

    if (!receipt.status) {
        throw new Error("Transfer transaction thất bại");
    }

    const rtbInterface = new ethers.Interface(RTB.abi);
    let transferFound = false;
    let transferTokenId: number | undefined;

    for (const log of receipt.logs) {
        try {
            const parsed = rtbInterface.parseLog({
                topics: log.topics as string[],
                data: log.data
            });

            if (parsed && parsed.name === "RTBTransferred") {
                const eventTokenId = Number(parsed.args.tokenId);
                const from = parsed.args.from;
                const to = parsed.args.to;

                // Verify token matches
                if (eventTokenId === listing.tokenId) {
                    // Verify from = seller
                    if (from.toLowerCase() === listing.sellerAddress.toLowerCase()) {
                        // Verify to = buyer
                        if (to.toLowerCase() === listing.buyerAddress.toLowerCase()) {
                            transferFound = true;
                            transferTokenId = eventTokenId;
                            break;
                        }
                    }
                }
            }
        } catch {
            // Continue if parse fails
        }
    }

    if (!transferFound) {
        throw new Error(
            `RTB transfer not found: RTB #${listing.tokenId} from ${listing.sellerAddress} to ${listing.buyerAddress}`
        );
    }

    // Update listing to sold
    const updated = await marketplaceRepo.updateListingStatus(listingId, "sold", {
        transferTxHash
    });

    console.log(`[MARKETPLACE] ✓ RTB transfer confirmed and listing marked as sold`);
    return updated;
}

// ================================
// Cancel Listing
// ================================

export async function cancelListing(
    listingId: string,
    cancellerAddress: string
) {
    if (!listingId) throw new Error("Listing ID không hợp lệ");
    if (!cancellerAddress) throw new Error("Địa chỉ người hủy không hợp lệ");

    const listing = await marketplaceRepo.findListingById(listingId);
    if (!listing) {
        throw new Error("Listing không tồn tại");
    }

    // Only seller can cancel
    if (cancellerAddress.toLowerCase() !== listing.sellerAddress.toLowerCase()) {
        throw new Error("Chỉ người bán mới có thể hủy listing");
    }

    if (listing.status === "sold") {
        throw new Error("Listing đã được bán, không thể hủy");
    }

    const updated = await marketplaceRepo.cancelListing(listingId);
    console.log(`[MARKETPLACE] Listing cancelled: ${listingId}`);
    return updated;
}
