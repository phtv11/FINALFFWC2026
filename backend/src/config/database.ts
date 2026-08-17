import dotenv from "dotenv";
import sql from "mssql";

dotenv.config();

const config: sql.config = {

    user:
        process.env.DB_USER,

    password:
        process.env.DB_PASSWORD,

    server:
        process.env.DB_SERVER!,

    database:
        process.env.DB_DATABASE,

    port: Number(process.env.DB_PORT || 1433),

    options: {
         encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

let pool: sql.ConnectionPool | null = null;

export async function connectDB(): Promise<sql.ConnectionPool> {
    if (!pool) {
        if (!config.database || !config.user || !config.password) {
            throw new Error("Thiếu cấu hình SQL Server trong .env");
        }

        pool = await sql.connect(config);
        console.log("SQL Server connected");
    }

    return pool;
}

export async function closeDB(): Promise<void> {
    if (pool) {
        await pool.close();
        pool = null;
    }
}

export async function initializeDatabase(): Promise<void> {
    const connection = await connectDB();
    await connection.query(`
        IF OBJECT_ID(N'[dbo].[matches]', N'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[matches] (
                [matchId] NVARCHAR(100) NOT NULL PRIMARY KEY,
                [name] NVARCHAR(255) NOT NULL,
                [date] DATETIME2 NOT NULL,
                [stadium] NVARCHAR(255) NULL,
                [totalSeats] INT NOT NULL
            );
        END;

        IF NOT EXISTS (SELECT 1 FROM [dbo].[matches] WHERE [matchId] = 'MATCH-001')
        BEGIN
            INSERT INTO [dbo].[matches] ([matchId], [name], [date], [stadium], [totalSeats])
            VALUES ('MATCH-001', 'Brazil vs Argentina', '2026-06-12T00:00:00', 'MetLife Stadium', 150);
        END;

        IF NOT EXISTS (SELECT 1 FROM [dbo].[matches] WHERE [matchId] = 'MATCH')
        BEGIN
            INSERT INTO [dbo].[matches] ([matchId], [name], [date], [stadium], [totalSeats])
            VALUES ('MATCH', 'France vs Germany', '2026-06-18T00:00:00', 'SoFi Stadium', 80);
        END;

        IF NOT EXISTS (SELECT 1 FROM [dbo].[matches] WHERE [matchId] = 'WC26-FINAL')
        BEGIN
            INSERT INTO [dbo].[matches] ([matchId], [name], [date], [stadium], [totalSeats])
            VALUES ('WC26-FINAL', 'Finalist A vs Finalist B', '2026-07-19T00:00:00', 'MetLife Stadium', 50);
        END;

        IF OBJECT_ID(N'[dbo].[orders]', N'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[orders] (
                [id] NVARCHAR(100) NOT NULL PRIMARY KEY,
                [userId] NVARCHAR(100) NOT NULL,
                [matchId] NVARCHAR(100) NOT NULL,
                [category] NVARCHAR(100) NULL,
                [seat] NVARCHAR(100) NULL,
                [price] DECIMAL(12, 2) NOT NULL,
                [status] NVARCHAR(50) NOT NULL,
                [rtbTokenId] INT NULL,
                [rttTokenId] INT NULL,
                [txHash] NVARCHAR(255) NULL,
                [idempotencyKey] NVARCHAR(255) NULL UNIQUE,
                [createdAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
                CONSTRAINT [FK_orders_matches] FOREIGN KEY ([matchId]) REFERENCES [dbo].[matches] ([matchId])
            );
        END;

        IF OBJECT_ID(N'[dbo].[token_index]', N'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[token_index] (
                [collection] NVARCHAR(10) NOT NULL, -- 'RTB' or 'RTT'
                [tokenId] INT NOT NULL,
                [owner] NVARCHAR(100) NOT NULL,
                [matchId] NVARCHAR(100) NOT NULL,
                [mintedAt] DATETIME2 NULL,
                [txHash] NVARCHAR(255) NULL,
                [updatedAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
                CONSTRAINT [PK_token_index] PRIMARY KEY ([collection], [tokenId])
            );
        END;

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
