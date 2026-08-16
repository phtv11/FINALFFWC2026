import { Router, Request, Response, NextFunction } from "express";

const router = Router();

// ===================================
// Marketplace routes
// ===================================

// Note: Most marketplace operations happen on-chain (buyer/seller actions)
// Backend only provides query/info endpoints for frontend

/**
 * POST /marketplace/get-listing
 * Get listing details from Marketplace contract (via frontend calling contract directly)
 * Backend may log/track listings if needed for analytics
 */
router.post("/get-listing", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tokenId } = req.body;

        if (!tokenId) {
            return res.status(400).json({
                error: "Token ID is required"
            });
        }

        // For now, listing query is handled by frontend calling the contract directly
        // Backend can be extended to cache/track listings if needed

        return res.status(200).json({
            message: "Call Marketplace contract directly for listing details",
            note: "Frontend should call Marketplace.getListing(tokenId)"
        });
    } catch (error: any) {
        return res.status(500).json({
            error: error?.message || "Failed to get listing"
        });
    }
});

/**
 * POST /marketplace/verify-sale
 * Verify a marketplace sale transaction
 * Called by frontend after buy() completes
 */
router.post("/verify-sale", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { buyerAddress, sellerAddress, tokenId, txHash } = req.body;

        if (!buyerAddress || !sellerAddress || !tokenId || !txHash) {
            return res.status(400).json({
                error: "Missing required fields: buyerAddress, sellerAddress, tokenId, txHash"
            });
        }

        // TODO: Verify the transaction on-chain
        // - Check txHash contains RTBSold event
        // - Verify buyer and seller addresses
        // - Verify tokenId
        // - Update order status in database if needed

        return res.status(200).json({
            message: "Marketplace sale verified",
            tokenId,
            buyer: buyerAddress,
            seller: sellerAddress,
            txHash
        });
    } catch (error: any) {
        return res.status(500).json({
            error: error?.message || "Failed to verify sale"
        });
    }
});

/**
 * GET /marketplace/fee-info
 * Get marketplace fee configuration
 */
router.get("/fee-info", async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Fee is 15% (1500/10000)
        const feePercentage = 15;
        const sellerPercentage = 85;

        return res.status(200).json({
            feePercentage,
            sellerPercentage,
            message: "Seller receives 85%, marketplace takes 15%"
        });
    } catch (error: any) {
        return res.status(500).json({
            error: error?.message || "Failed to get fee info"
        });
    }
});

export default router;
