import { Request, Response, NextFunction } from "express";
import * as marketplaceService from "../services/marketplaceService";
import { HttpError } from "../middleware/validate";

// ================================
// Create Listing
// ================================

export async function createListing(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const { sellerAddress, tokenId, matchId, price } = req.body;

        const listing = await marketplaceService.createListing(
            sellerAddress,
            tokenId,
            matchId,
            price
        );

        res.status(201).json({
            success: true,
            listing
        });
    } catch (error) {
        next(error);
    }
}

// ================================
// Get Active Listings
// ================================

export async function getActiveListings(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const listings = await marketplaceService.getActiveListings();

        res.status(200).json({
            success: true,
            listings
        });
    } catch (error) {
        next(error);
    }
}

// ================================
// Get Listing by ID
// ================================

export async function getListingById(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const listing = await marketplaceService.getListingById(id);
        if (!listing) {
            throw new HttpError(404, "Listing không tồn tại");
        }

        res.status(200).json({
            success: true,
            listing
        });
    } catch (error) {
        next(error);
    }
}

// ================================
// Initiate Purchase (Record Payment TX)
// ================================

export async function initiatePurchase(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const { listingId, buyerAddress, paymentTxHash } = req.body;

        const updated = await marketplaceService.handlePurchase(
            listingId,
            buyerAddress,
            paymentTxHash
        );

        res.status(200).json({
            success: true,
            message: "Yêu cầu mua đã được ghi nhận. Đang chờ xác minh thanh toán.",
            listing: updated
        });
    } catch (error) {
        next(error);
    }
}

// ================================
// Verify Payment & Update Listing
// ================================

export async function verifyPayment(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const { listingId, paymentTxHash } = req.body;

        const updated = await marketplaceService.verifyPaymentAndUpdateListing(
            listingId,
            paymentTxHash
        );

        res.status(200).json({
            success: true,
            message: "Thanh toán đã được xác minh. Đang chờ người bán duyệt giao dịch.",
            listing: updated
        });
    } catch (error) {
        next(error);
    }
}

// ================================
// Confirm RTB Transfer & Mark Sold
// ================================

export async function confirmTransfer(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const { listingId, transferTxHash } = req.body;

        const updated = await marketplaceService.confirmRTBTransferAndMarkSold(
            listingId,
            transferTxHash
        );

        res.status(200).json({
            success: true,
            message: "Giao dịch hoàn tất! RTB đã được chuyển nhượng thành công.",
            listing: updated
        });
    } catch (error) {
        next(error);
    }
}

// ================================
// Cancel Listing
// ================================

export async function cancelListing(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const { listingId, cancellerAddress } = req.body;

        const updated = await marketplaceService.cancelListing(
            listingId,
            cancellerAddress
        );

        res.status(200).json({
            success: true,
            message: "Listing đã bị hủy.",
            listing: updated
        });
    } catch (error) {
        next(error);
    }
}
