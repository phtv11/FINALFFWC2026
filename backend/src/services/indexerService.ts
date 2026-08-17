import { provider } from "../config/blockchain";
import RTB from "../contracts/FIFARTB.json";
import MarketplaceAbi from "../contracts/Marketplace.json";
import { upsertTokenIndex } from "../repositories/tokenIndexRepository";
import { updateOrderUserByRtbTokenId } from "../repositories/orderRepository";
import {
    upsertMarketplaceListing,
    findMarketplaceListingByRtbTokenId,
    findMarketplaceListingById,
    updateMarketplaceListingStatus
} from "../repositories/marketplaceListingRepository";
import { ethers } from "ethers";

let started = false;

export function startIndexer() {
    if (started) return;
    started = true;

    const rtbInterface = new ethers.Interface(RTB.abi);
    const marketplaceInterface = new ethers.Interface(MarketplaceAbi.abi);
    const rtbAddress = process.env.RTB_ADDRESS;
    const marketplaceAddress = process.env.MARKETPLACE_ADDRESS;

    if (!rtbAddress) {
        console.error("Indexer: RTB_ADDRESS not configured, indexer not started");
        return;
    }

    console.log("Indexer: starting poller for RTB and Marketplace events");

    (async () => {
        try {
            const current = await provider.getBlockNumber();
            let lastChecked = Math.max(0, current - 10);
            const POLL_INTERVAL = Number(process.env.INDEXER_POLL_INTERVAL_MS || 5000);

            setInterval(async () => {
                try {
                    const toBlock = await provider.getBlockNumber();
                    if (toBlock <= lastChecked) return;

                    const fromBlock = lastChecked + 1;
                    const addresses = [rtbAddress];
                    if (marketplaceAddress) addresses.push(marketplaceAddress);

                    const logs = await provider.getLogs({
                        address: addresses,
                        fromBlock,
                        toBlock
                    });

                    for (const log of logs) {
                        try {
                            const txHash = log.transactionHash || null;

                            if (log.address.toLowerCase() === rtbAddress.toLowerCase()) {
                                const parsed = rtbInterface.parseLog({ topics: log.topics as string[], data: log.data });
                                if (!parsed || !parsed.name) continue;

                                if (parsed.name === "RTBMinted") {
                                    const tokenId = Number(parsed.args.tokenId?.toString());
                                    const to = String(parsed.args.to);
                                    const matchId = String(parsed.args.matchId);
                                    await upsertTokenIndex({ collection: "RTB", tokenId, owner: to, matchId, mintedAt: new Date(), txHash });
                                } else if (parsed.name === "RTBTransferred") {
                                    const tokenId = Number(parsed.args.tokenId?.toString());
                                    const to = String(parsed.args.to ?? parsed.args[2]);
                                    await upsertTokenIndex({ collection: "RTB", tokenId, owner: to, txHash });
                                    await updateOrderUserByRtbTokenId(tokenId, to);
                                } else if (parsed.name === "Transfer") {
                                    const tokenId = Number(parsed.args.tokenId?.toString());
                                    const to = String(parsed.args.to ?? parsed.args[2]);
                                    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
                                    if (to.toLowerCase() === ZERO_ADDRESS.toLowerCase()) continue;
                                    await upsertTokenIndex({ collection: "RTB", tokenId, owner: to, txHash });
                                } else if (parsed.name === "RedeemedToRTT") {
                                    const rtbTokenId = Number(parsed.args.rtbTokenId?.toString());
                                    const holder = String(parsed.args.holder ?? parsed.args[1]);
                                    const rttTokenId = Number(parsed.args.rttTokenId?.toString());
                                    await upsertTokenIndex({ collection: "RTB", tokenId: rtbTokenId, owner: holder, txHash });
                                    await upsertTokenIndex({ collection: "RTT", tokenId: rttTokenId, owner: holder, txHash });
                                }
                            }

                            if (marketplaceAddress && log.address.toLowerCase() === marketplaceAddress.toLowerCase()) {
                                const parsed = marketplaceInterface.parseLog({ topics: log.topics as string[], data: log.data });
                                if (!parsed || !parsed.name) continue;

                                if (parsed.name === "Listed") {
                                    const listingId = Number(parsed.args.listingId?.toString());
                                    const tokenId = Number(parsed.args.tokenId?.toString());
                                    const seller = String(parsed.args.seller);
                                    const price = Number(ethers.formatUnits(parsed.args.price ?? 0n, 6));
                                    await upsertMarketplaceListing({
                                        rtbTokenId: tokenId,
                                        seller,
                                        buyer: null,
                                        price,
                                        status: "ACTIVE",
                                        listTxHash: txHash,
                                        buyTxHash: null,
                                        createdAt: new Date(),
                                        soldAt: null
                                    });
                                    if (listingId) {
                                        await upsertMarketplaceListing({
                                            rtbTokenId: tokenId,
                                            seller,
                                            buyer: null,
                                            price,
                                            status: "ACTIVE",
                                            listTxHash: txHash,
                                            buyTxHash: null,
                                            createdAt: new Date(),
                                            soldAt: null
                                        });
                                    }
                                } else if (parsed.name === "Cancelled") {
                                    const tokenId = Number(parsed.args.tokenId?.toString());
                                    const existing = await findMarketplaceListingByRtbTokenId(tokenId);
                                    if (existing && existing.listingId !== undefined) {
                                        await updateMarketplaceListingStatus(existing.listingId, "CANCELLED", null, null);
                                    }
                                } else if (parsed.name === "Sold") {
                                    const tokenId = Number(parsed.args.tokenId?.toString());
                                    const buyer = String(parsed.args.buyer);
                                    const listingId = Number(parsed.args.listingId?.toString());
                                    const existing = await findMarketplaceListingByRtbTokenId(tokenId);
                                    if (existing && existing.listingId !== undefined) {
                                        await updateMarketplaceListingStatus(existing.listingId, "SOLD", buyer, txHash);
                                    } else if (listingId) {
                                        const record = await findMarketplaceListingById(listingId);
                                        if (record && record.listingId !== undefined) {
                                            await updateMarketplaceListingStatus(record.listingId, "SOLD", buyer, txHash);
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    lastChecked = toBlock;
                } catch (e) {
                    console.error("Indexer poll error:", e);
                }
            }, POLL_INTERVAL);

        } catch (e) {
            console.error("Indexer startup error:", e);
        }
    })();
}
