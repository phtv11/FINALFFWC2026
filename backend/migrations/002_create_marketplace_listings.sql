-- Migration: Create marketplace_listings table
-- Date: 2026-08-16
-- Purpose: Store marketplace listings created by sellers

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'marketplace_listings' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[marketplace_listings] (
        [id] NVARCHAR(MAX) PRIMARY KEY NOT NULL,
        [tokenId] INT NOT NULL,
        [matchId] NVARCHAR(MAX) NOT NULL,
        [sellerAddress] NVARCHAR(MAX) NOT NULL,
        [buyerAddress] NVARCHAR(MAX) NULL,
        [price] FLOAT NOT NULL,
        [status] NVARCHAR(50) NOT NULL DEFAULT 'active',
        -- status values: 'active', 'pending', 'sold', 'cancelled'
        [sellerAuthTxHash] NVARCHAR(MAX) NULL,
        -- Optional: hash of seller's authorization signature/tx if needed
        [paymentTxHash] NVARCHAR(MAX) NULL,
        -- Buyer's USDC payment transaction hash
        [transferTxHash] NVARCHAR(MAX) NULL,
        -- RTB transfer transaction hash after payment confirmed
        [paymentVerifiedAt] DATETIME NULL,
        -- Timestamp when USDC payment was verified
        [createdAt] DATETIME NOT NULL DEFAULT GETUTCDATE(),
        [updatedAt] DATETIME NOT NULL DEFAULT GETUTCDATE()
    );
    
    CREATE INDEX [idx_marketplace_status] ON [dbo].[marketplace_listings] ([status]);
    CREATE INDEX [idx_marketplace_tokenId] ON [dbo].[marketplace_listings] ([tokenId]);
    CREATE INDEX [idx_marketplace_seller] ON [dbo].[marketplace_listings] ([sellerAddress]);
    CREATE INDEX [idx_marketplace_buyer] ON [dbo].[marketplace_listings] ([buyerAddress]);
    
    PRINT 'Created table: marketplace_listings';
END
ELSE
BEGIN
    PRINT 'Table marketplace_listings already exists';
END;
