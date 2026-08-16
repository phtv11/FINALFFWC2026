import { connectDB } from "../config/database";

export interface MarketplaceListingRow {
    id: string;
    tokenId: number;
    matchId: string;
    sellerAddress: string;
    buyerAddress?: string | null;
    price: number;
    status: "active" | "pending" | "sold" | "cancelled";
    sellerAuthTxHash?: string | null;
    paymentTxHash?: string | null;
    transferTxHash?: string | null;
    paymentVerifiedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}

export async function createListing(listing: MarketplaceListingRow): Promise<MarketplaceListingRow> {
    const pool = await connectDB();
    const result = await pool.request()
        .input("id", listing.id)
        .input("tokenId", listing.tokenId)
        .input("matchId", listing.matchId)
        .input("sellerAddress", listing.sellerAddress)
        .input("buyerAddress", listing.buyerAddress || null)
        .input("price", listing.price)
        .input("status", listing.status || "active")
        .input("sellerAuthTxHash", listing.sellerAuthTxHash || null)
        .input("paymentTxHash", listing.paymentTxHash || null)
        .input("transferTxHash", listing.transferTxHash || null)
        .input("paymentVerifiedAt", listing.paymentVerifiedAt || null)
        .query(`
            INSERT INTO [dbo].[marketplace_listings] (
                [id], [tokenId], [matchId], [sellerAddress], [buyerAddress], [price], 
                [status], [sellerAuthTxHash], [paymentTxHash], [transferTxHash], [paymentVerifiedAt]
            )
            VALUES (
                @id, @tokenId, @matchId, @sellerAddress, @buyerAddress, @price,
                @status, @sellerAuthTxHash, @paymentTxHash, @transferTxHash, @paymentVerifiedAt
            );
            
            SELECT TOP 1 * FROM [dbo].[marketplace_listings] WHERE [id] = @id;
        `);
    return result.recordset[0];
}

export async function findListingById(id: string): Promise<MarketplaceListingRow | null> {
    const pool = await connectDB();
    const result = await pool.request()
        .input("id", id)
        .query(`
            SELECT TOP 1 * FROM [dbo].[marketplace_listings]
            WHERE [id] = @id;
        `);
    return result.recordset[0] || null;
}

export async function findListingByTokenId(tokenId: number): Promise<MarketplaceListingRow | null> {
    const pool = await connectDB();
    const result = await pool.request()
        .input("tokenId", tokenId)
        .query(`
            SELECT TOP 1 * FROM [dbo].[marketplace_listings]
            WHERE [tokenId] = @tokenId AND [status] != 'sold' AND [status] != 'cancelled'
            ORDER BY [createdAt] DESC;
        `);
    return result.recordset[0] || null;
}

export async function findActiveListings(): Promise<MarketplaceListingRow[]> {
    const pool = await connectDB();
    const result = await pool.request()
        .query(`
            SELECT * FROM [dbo].[marketplace_listings]
            WHERE [status] IN ('active', 'pending')
            ORDER BY [createdAt] DESC;
        `);
    return result.recordset;
}

export async function findListingsBySeller(sellerAddress: string): Promise<MarketplaceListingRow[]> {
    const pool = await connectDB();
    const result = await pool.request()
        .input("sellerAddress", sellerAddress.toLowerCase())
        .query(`
            SELECT * FROM [dbo].[marketplace_listings]
            WHERE LOWER([sellerAddress]) = @sellerAddress
            ORDER BY [createdAt] DESC;
        `);
    return result.recordset;
}

export async function findListingsByBuyer(buyerAddress: string): Promise<MarketplaceListingRow[]> {
    const pool = await connectDB();
    const result = await pool.request()
        .input("buyerAddress", buyerAddress.toLowerCase())
        .query(`
            SELECT * FROM [dbo].[marketplace_listings]
            WHERE LOWER([buyerAddress]) = @buyerAddress
            ORDER BY [createdAt] DESC;
        `);
    return result.recordset;
}

export async function updateListingStatus(
    id: string,
    status: "active" | "pending" | "sold" | "cancelled",
    updates?: Partial<MarketplaceListingRow>
): Promise<MarketplaceListingRow | null> {
    const pool = await connectDB();
    
    const query = `
        UPDATE [dbo].[marketplace_listings]
        SET 
            [status] = @status,
            ${updates?.buyerAddress !== undefined ? "[buyerAddress] = @buyerAddress," : ""}
            ${updates?.paymentTxHash !== undefined ? "[paymentTxHash] = @paymentTxHash," : ""}
            ${updates?.paymentVerifiedAt !== undefined ? "[paymentVerifiedAt] = @paymentVerifiedAt," : ""}
            ${updates?.transferTxHash !== undefined ? "[transferTxHash] = @transferTxHash," : ""}
            [updatedAt] = GETUTCDATE()
        WHERE [id] = @id;
        
        SELECT TOP 1 * FROM [dbo].[marketplace_listings] WHERE [id] = @id;
    `;
    
    const request = pool.request()
        .input("id", id)
        .input("status", status);
    
    if (updates?.buyerAddress !== undefined) request.input("buyerAddress", updates.buyerAddress || null);
    if (updates?.paymentTxHash !== undefined) request.input("paymentTxHash", updates.paymentTxHash || null);
    if (updates?.paymentVerifiedAt !== undefined) request.input("paymentVerifiedAt", updates.paymentVerifiedAt || null);
    if (updates?.transferTxHash !== undefined) request.input("transferTxHash", updates.transferTxHash || null);
    
    const result = await request.query(query);
    return result.recordset[0] || null;
}

export async function cancelListing(id: string): Promise<MarketplaceListingRow | null> {
    return updateListingStatus(id, "cancelled");
}

export async function deleteListing(id: string): Promise<boolean> {
    const pool = await connectDB();
    const result = await pool.request()
        .input("id", id)
        .query(`
            DELETE FROM [dbo].[marketplace_listings]
            WHERE [id] = @id;
        `);
    return result.rowsAffected[0] > 0;
}
