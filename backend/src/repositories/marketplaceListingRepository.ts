import { connectDB } from "../config/database";

export interface MarketplaceListingRow {
    listingId?: number;
    rtbTokenId: number;
    seller: string;
    buyer?: string | null;
    price: number;
    status: "ACTIVE" | "SOLD" | "CANCELLED";
    listTxHash?: string | null;
    buyTxHash?: string | null;
    createdAt?: Date;
    soldAt?: Date | null;
}

export async function ensureMarketplaceListingTable(): Promise<void> {
    const pool = await connectDB();
    await pool.request().query(`
        IF OBJECT_ID(N'[dbo].[marketplace_listing]', N'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[marketplace_listing] (
                [listingId] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                [rtbTokenId] INT NOT NULL,
                [seller] NVARCHAR(255) NOT NULL,
                [buyer] NVARCHAR(255) NULL,
                [price] DECIMAL(18, 6) NOT NULL,
                [status] NVARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                [listTxHash] NVARCHAR(255) NULL,
                [buyTxHash] NVARCHAR(255) NULL,
                [createdAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
                [soldAt] DATETIME2 NULL,
                CONSTRAINT [UQ_marketplace_listing_rtbTokenId] UNIQUE ([rtbTokenId])
            );

            CREATE INDEX IX_marketplace_listing_status_createdAt
                ON [dbo].[marketplace_listing] ([status], [createdAt] DESC);
        END;
    `);
}

export async function findActiveMarketplaceListings(): Promise<MarketplaceListingRow[]> {
    const pool = await connectDB();
    const result = await pool.request().query(`
        SELECT *
        FROM [dbo].[marketplace_listing]
        WHERE [status] = 'ACTIVE'
        ORDER BY [createdAt] DESC;
    `);
    return result.recordset || [];
}

export async function findMarketplaceListingById(listingId: number): Promise<MarketplaceListingRow | null> {
    const pool = await connectDB();
    const result = await pool.request()
        .input("listingId", listingId)
        .query(`
            SELECT TOP 1 *
            FROM [dbo].[marketplace_listing]
            WHERE [listingId] = @listingId;
        `);
    return result.recordset[0] || null;
}

export async function findMarketplaceListingByRtbTokenId(rtbTokenId: number): Promise<MarketplaceListingRow | null> {
    const pool = await connectDB();
    const result = await pool.request()
        .input("rtbTokenId", rtbTokenId)
        .query(`
            SELECT TOP 1 *
            FROM [dbo].[marketplace_listing]
            WHERE [rtbTokenId] = @rtbTokenId
            ORDER BY [createdAt] DESC;
        `);
    return result.recordset[0] || null;
}

export async function upsertMarketplaceListing(row: MarketplaceListingRow): Promise<MarketplaceListingRow | null> {
    const pool = await connectDB();

    const data = await pool.request()
        .input("rtbTokenId", row.rtbTokenId)
        .input("seller", row.seller)
        .input("buyer", row.buyer ?? null)
        .input("price", Number(row.price))
        .input("status", row.status)
        .input("listTxHash", row.listTxHash ?? null)
        .input("buyTxHash", row.buyTxHash ?? null)
        .query(`
            IF EXISTS (SELECT 1 FROM [dbo].[marketplace_listing] WHERE [rtbTokenId] = @rtbTokenId)
            BEGIN
                UPDATE [dbo].[marketplace_listing]
                SET [seller] = @seller,
                    [buyer] = @buyer,
                    [price] = @price,
                    [status] = @status,
                    [listTxHash] = @listTxHash,
                    [buyTxHash] = @buyTxHash,
                    [soldAt] = CASE WHEN @status = 'SOLD' THEN GETDATE() ELSE [soldAt] END
                WHERE [rtbTokenId] = @rtbTokenId;
            END
            ELSE
            BEGIN
                INSERT INTO [dbo].[marketplace_listing] ([rtbTokenId], [seller], [buyer], [price], [status], [listTxHash], [buyTxHash], [createdAt], [soldAt])
                VALUES (@rtbTokenId, @seller, @buyer, @price, @status, @listTxHash, @buyTxHash, GETDATE(), CASE WHEN @status = 'SOLD' THEN GETDATE() ELSE NULL END);
            END;

            SELECT TOP 1 *
            FROM [dbo].[marketplace_listing]
            WHERE [rtbTokenId] = @rtbTokenId
            ORDER BY [createdAt] DESC;
        `);

    return data.recordset[0] || null;
}

export async function updateMarketplaceListingStatus(
    listingId: number,
    status: "ACTIVE" | "SOLD" | "CANCELLED",
    buyer?: string | null,
    buyTxHash?: string | null
): Promise<MarketplaceListingRow | null> {
    const pool = await connectDB();
    const result = await pool.request()
        .input("listingId", listingId)
        .input("status", status)
        .input("buyer", buyer ?? null)
        .input("buyTxHash", buyTxHash ?? null)
        .query(`
            UPDATE [dbo].[marketplace_listing]
            SET [buyer] = @buyer,
                [status] = @status,
                [buyTxHash] = @buyTxHash,
                [soldAt] = CASE WHEN @status = 'SOLD' THEN GETDATE() ELSE [soldAt] END
            WHERE [listingId] = @listingId;

            SELECT TOP 1 *
            FROM [dbo].[marketplace_listing]
            WHERE [listingId] = @listingId;
        `);
    return result.recordset[0] || null;
}

export async function updateMarketplaceListingCancelled(listingId: number): Promise<MarketplaceListingRow | null> {
    return updateMarketplaceListingStatus(listingId, "CANCELLED", null, null);
}
