import { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";
import { getMarketplaceListingById, getMarketplaceListings, getMarketplaceOwner } from "../services/marketplaceService";

export async function getMarketplaceListingsController(req: Request, res: Response, next: NextFunction) {
    try {
        const listings = await getMarketplaceListings();
        return res.status(200).json({ success: true, data: listings });
    } catch (error) {
        return next(error);
    }
}

export async function getMarketplaceListingByIdController(req: Request, res: Response, next: NextFunction) {
    try {
        const listingId = Number(req.params.id);
        if (!Number.isInteger(listingId) || listingId <= 0) {
            return res.status(400).json({ success: false, message: "Invalid listing id" });
        }

        const listing = await getMarketplaceListingById(listingId);
        if (!listing) {
            return res.status(404).json({ success: false, message: "Listing not found" });
        }

        return res.status(200).json({ success: true, data: listing });
    } catch (error) {
        return next(error);
    }
}

export async function getMarketplaceOwnerController(req: Request, res: Response, next: NextFunction) {
    try {
        const address = req.params.address;
        if (!ethers.isAddress(address)) {
            return res.status(400).json({ success: false, message: "Invalid wallet address" });
        }

        const result = await getMarketplaceOwner(address);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        return next(error);
    }
}
