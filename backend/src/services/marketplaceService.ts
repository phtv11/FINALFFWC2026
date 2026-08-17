import { ethers } from "ethers";
import { provider } from "../config/blockchain";
import {
    findActiveMarketplaceListings,
    findMarketplaceListingById,
    ensureMarketplaceListingTable,
    findMarketplaceListingByRtbTokenId
} from "../repositories/marketplaceListingRepository";

export async function getMarketplaceListings() {
    await ensureMarketplaceListingTable();
    return await findActiveMarketplaceListings();
}

export async function getMarketplaceListingById(listingId: number) {
    await ensureMarketplaceListingTable();
    return await findMarketplaceListingById(listingId);
}

export async function getMarketplaceOwner(address: string) {
    await ensureMarketplaceListingTable();

    const result = await provider.getCode(address);
    if (!result || result === "0x") {
        return { address, ownership: [] };
    }

    return { address, ownership: [] };
}

export async function getMarketplaceListingByTokenId(rtbTokenId: number) {
    await ensureMarketplaceListingTable();
    return findMarketplaceListingByRtbTokenId(rtbTokenId);
}

export async function getMarketplaceStatusSummary() {
    const listings = await getMarketplaceListings();
    return {
        total: listings.length,
        statuses: {
            active: listings.filter((item) => item.status === "ACTIVE").length
        }
    };
}

export async function validateListingOnChain(listingId: number, buyerAddress: string) {
    const listing = await findMarketplaceListingById(listingId);
    if (!listing) throw new Error("Listing not found");
    if (!ethers.isAddress(buyerAddress)) throw new Error("buyerAddress invalid");
    if (listing.status !== "ACTIVE") throw new Error("Listing is not active");
    return listing;
}
