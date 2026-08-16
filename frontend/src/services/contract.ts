import { ethers } from "ethers";

import FIFARTB from "../abi/FIFARTB.json";
import FIFARTT from "../abi/FIFARTT.json";
import FIFARTBMarketplace from "../abi/FIFARTBMarketplace.json";
import USDC from "../abi/USDC.json";



// ==============================
// Contract Address
// ==============================

const RTB_ADDRESS =
    import.meta.env.VITE_RTB_ADDRESS;


const RTT_ADDRESS =
    import.meta.env.VITE_RTT_ADDRESS;

const MARKETPLACE_ADDRESS =
    import.meta.env.VITE_MARKETPLACE_ADDRESS;

const USDC_ADDRESS =
    import.meta.env.VITE_USDC_ADDRESS || "0x5425890298aed601595a70AB815c96711a31Bc65";

const USDC_DECIMALS = 6;



// ==============================
// Provider
// Chỉ đọc blockchain
// ==============================

export function getProvider(){


    if(!window.ethereum){

        throw new Error(
            "MetaMask chưa được cài"
                    );

    }


    return new ethers.BrowserProvider(
        window.ethereum
    );

}



// ==================================================
// Connect Wallet
// Gọi MetaMask lấy địa chỉ user
// ==================================================

export async function connectWallet(forceReconnect = false): Promise<string> {


    if(!window.ethereum){

        throw new Error(
            "Chưa cài MetaMask"
        );

    }

    if (forceReconnect) {
        try {
            await window.ethereum.request({
                method: "wallet_revokePermissions",
                params: [{ eth_accounts: {} }]
            });
        } catch {
            // ignore revoke errors and continue with a fresh request
        }
    }

    const accounts =
        await window.ethereum.request({

            method:"eth_requestAccounts"

        });



    if(accounts.length === 0){

        throw new Error(
            "Không tìm thấy wallet"
        );

    }



    return accounts[0];
}

// ==============================
// Signer
// User ký transaction
// ==============================
async function getSigner(){


    const provider =
        getProvider();



    return await provider.getSigner();


}





// ==============================
// Lấy contract RTB có signer
// Dùng transfer + redeem
// ==============================

async function getRTBContract(){


    const signer =
        await getSigner();



    return new ethers.Contract(

        RTB_ADDRESS,

        FIFARTB.abi,

        signer

    );


}





// ==============================
// Lấy contract RTT đọc dữ liệu
// ==============================

async function getRTTReadContract(){


    const provider =
        getProvider();



    return new ethers.Contract(

        RTT_ADDRESS,

        FIFARTT.abi,

        provider

    );


}







// ==================================================
// USER ACTION
// transferRTB()
// User ký MetaMask
// ==================================================

export async function transferRTB(

    to:string,

    tokenId:number

){


    const contract =
        await getRTBContract();



    const tx =
        await contract.transferRTB(

            to,

            tokenId

        );



    await tx.wait();



    return tx.hash;


}







// ==================================================
// USER ACTION
// redeem RTB -> RTT
// User ký MetaMask
// ==================================================

export async function redeemRTB(

    tokenId:number

){


    const contract =
        await getRTBContract();



    const tx =
        await contract.redeem(

            tokenId

        );



    await tx.wait();



    return tx.hash;


}







// ==================================================
// READ RTB INFO
// ==================================================

export async function getRTBInfo(

    tokenId:number

){


    const provider =
        getProvider();



    const contract =
        new ethers.Contract(

            RTB_ADDRESS,

            FIFARTB.abi,

            provider

        );



    const owner =
        await contract.ownerOf(
            tokenId
        );



    const data =
        await contract.tokenInfo(
            tokenId
        );



    return {

        owner,

        matchId:data.matchId

    };


}







// ==================================================
// READ RTT STATUS
// ==================================================

export async function getRTTStatus(

    tokenId:number

){


    const contract =
        await getRTTReadContract();



    return await contract.getStatus(

        tokenId

    );


}


// ==================================================
// MARKETPLACE FUNCTIONS
// ==================================================

// ==============================
// Get Marketplace Contract (read)
// ==============================

async function getMarketplaceReadContract() {
    if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace address not configured");
    }
    
    const provider = getProvider();
    
    return new ethers.Contract(
        MARKETPLACE_ADDRESS,
        FIFARTBMarketplace.abi,
        provider
    );
}


// ==============================
// Get Marketplace Contract (write)
// ==============================

async function getMarketplaceContract() {
    if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace address not configured");
    }

    const signer = await getSigner();
    
    return new ethers.Contract(
        MARKETPLACE_ADDRESS,
        FIFARTBMarketplace.abi,
        signer
    );
}


// ==============================
// Get USDC Contract (write)
// ==============================

async function getUSDCContract() {
    const signer = await getSigner();
    
    return new ethers.Contract(
        USDC_ADDRESS,
        USDC.abi,
        signer
    );
}


// ==============================
// Get USDC Contract (read)
// ==============================

async function getUSDCReadContract() {
    const provider = getProvider();
    
    return new ethers.Contract(
        USDC_ADDRESS,
        USDC.abi,
        provider
    );
}


// ==============================
// Seller: Create Listing
// ==============================

export async function createMarketplaceListing(
    tokenId: number,
    priceUSDC: number
) {
    if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace address not configured");
    }

    const marketplace = await getMarketplaceContract();
    
    // Convert price to USDC units (6 decimals)
    const priceInSmallestUnits = ethers.parseUnits(
        priceUSDC.toString(),
        USDC_DECIMALS
    );
    
    const tx = await marketplace.createListing(
        tokenId,
        priceInSmallestUnits
    );
    
    await tx.wait();
    
    return tx.hash;
}


// ==============================
// Seller: Cancel Listing
// ==============================

export async function cancelMarketplaceListing(tokenId: number) {
    if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace address not configured");
    }

    const marketplace = await getMarketplaceContract();
    
    const tx = await marketplace.cancelListing(tokenId);
    
    await tx.wait();
    
    return tx.hash;
}


// ==============================
// Buyer: Approve USDC for Marketplace
// ==============================

export async function approveUSDCForMarketplace(amountUSDC: number) {
    const usdc = await getUSDCContract();
    
    if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace address not configured");
    }
    
    // Convert to smallest units (6 decimals)
    const amount = ethers.parseUnits(
        amountUSDC.toString(),
        USDC_DECIMALS
    );
    
    const tx = await usdc.approve(MARKETPLACE_ADDRESS, amount);
    
    await tx.wait();
    
    return tx.hash;
}


// ==============================
// Check USDC Allowance
// ==============================

export async function getUSDCAllowance(userAddress: string) {
    if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace address not configured");
    }

    const usdc = await getUSDCReadContract();
    
    const allowance = await usdc.allowance(userAddress, MARKETPLACE_ADDRESS);
    
    // Convert from smallest units to USDC
    return Number(allowance) / (10 ** USDC_DECIMALS);
}


// ==============================
// Check USDC Balance
// ==============================

export async function getUSDCBalance(userAddress: string) {
    const usdc = await getUSDCReadContract();
    
    const balance = await usdc.balanceOf(userAddress);
    
    // Convert from smallest units to USDC
    return Number(balance) / (10 ** USDC_DECIMALS);
}


// ==============================
// Buyer: Buy RTB from Marketplace
// ==============================

export async function buyFromMarketplace(tokenId: number) {
    if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace address not configured");
    }

    const marketplace = await getMarketplaceContract();
    
    const tx = await marketplace.buy(tokenId);
    
    await tx.wait();
    
    return tx.hash;
}


// ==============================
// Read: Get Listing Details
// ==============================

export async function getMarketplaceListing(tokenId: number) {
    const marketplace = await getMarketplaceReadContract();
    
    const listing = await marketplace.getListing(tokenId);
    
    // Convert price from smallest units to USDC
    const priceUSDC = Number(listing.price) / (10 ** USDC_DECIMALS);
    const feeAmount = (priceUSDC * 15) / 100;
    const sellerAmount = priceUSDC - feeAmount;
    
    return {
        seller: listing.seller,
        tokenId: Number(listing.tokenId),
        price: priceUSDC,
        active: listing.active,
        createdAt: Number(listing.createdAt),
        feeAmount,
        sellerAmount
    };
}

// ==============================
// Read: Get All Active Listings
// ==============================

export async function getMarketplaceListings() {
    const marketplace = await getMarketplaceReadContract();
    const provider = getProvider();
    const rtbContract = new ethers.Contract(RTB_ADDRESS, FIFARTB.abi, provider);
    
    const listings = [];
    
    // Scan token IDs from 1 to 1000 to find active listings
    for (let tokenId = 1; tokenId <= 1000; tokenId++) {
        try {
            const isActive = await marketplace.isListingActive(tokenId);
            
            if (isActive) {
                const listing = await marketplace.getListing(tokenId);
                
                // Convert price from smallest units to USDC
                const priceUSDC = Number(listing.price) / (10 ** USDC_DECIMALS);
                
                // Get matchId from RTB contract
                let matchId = "Unknown";
                try {
                    const tokenInfo = await rtbContract.tokenInfo(tokenId);
                    matchId = tokenInfo.matchId;
                } catch (e) {
                    // Token doesn't exist or error, use Unknown
                }
                
                listings.push({
                    seller: listing.seller,
                    tokenId: Number(listing.tokenId),
                    price: priceUSDC,
                    active: listing.active,
                    createdAt: Number(listing.createdAt),
                    matchId: matchId
                });
            }
        } catch (error) {
            // Token ID doesn't exist or error reading, continue
            continue;
        }
    }
    
    return listings;
}


// ==============================
// Read: Check if Listing is Active
// ==============================

export async function isMarketplaceListingActive(tokenId: number) {
    const marketplace = await getMarketplaceReadContract();
    
    return await marketplace.isListingActive(tokenId);
}


// ==============================
// Read: Calculate Fee
// ==============================

export async function calculateMarketplaceFee(priceUSDC: number) {
    const marketplace = await getMarketplaceReadContract();
    
    const priceInSmallestUnits = ethers.parseUnits(
        priceUSDC.toString(),
        USDC_DECIMALS
    );
    
    const fee = await marketplace.calculateFee(priceInSmallestUnits);
    
    // Convert from smallest units to USDC
    return Number(fee) / (10 ** USDC_DECIMALS);
}


// ==============================
// Transfer USDC (for Redeem payment)
// ==============================

export async function transferUSDC(
    recipientAddress: string,
    amountUSDC: number
) {
    const usdc = await getUSDCContract();
    
    // Convert to smallest units (6 decimals) using ethers.parseUnits
    const amount = ethers.parseUnits(
        amountUSDC.toString(),
        USDC_DECIMALS
    );
    
    const tx = await usdc.transfer(recipientAddress, amount);
    
    await tx.wait();
    
    return tx.hash;
}







// ==================================================
// Lấy RTB của user
// DEMO MVP
// ==================================================

export async function getUserRTBs(

    address:string

){


    const provider =
        getProvider();



    const contract =
        new ethers.Contract(

            RTB_ADDRESS,

            FIFARTB.abi,

            provider

        );



    const nextTokenId =
        await contract.nextTokenId();

    const maxTokenId =
        Number(nextTokenId) - 1;

    const result:any[] = [];



    for(
        let tokenId = 1;
        tokenId <= maxTokenId;
        tokenId++
    ){



        try {


            const owner =
                await contract.ownerOf(
                    tokenId
                );



            if(
                owner.toLowerCase()
                ===
                address.toLowerCase()
            ){


                const info =
                    await contract.tokenInfo(
                        tokenId
                    );



                result.push({

                    tokenId,

                    matchId:
                    info.matchId,

                    owner

                });


            }


        }
        catch{

            continue;

        }


    }



    return result;


}







// ==================================================
// Lấy RTT của user
// ==================================================

export async function getUserRTTs(

    address:string

){


    const contract =
        await getRTTReadContract();


    const nextTokenId =
        await contract.nextTokenId();

    const maxTokenId =
        Number(nextTokenId) - 1;


    const result:any[] = [];


    for(
        let tokenId = 1;
        tokenId <= maxTokenId;
        tokenId++
    ){


        try{


            const owner =
                await contract.ownerOf(
                    tokenId
                );


            if(
                owner.toLowerCase()
                ===
                address.toLowerCase()
            ){


                const status =
                    await contract.getStatus(
                        tokenId
                    );

                const info =
                    await contract.tokenInfo(
                        tokenId
                    );


                result.push({

                    tokenId,

                    matchId:
                    info.matchId,

                    status,

                    ticketRef: undefined

                });


            }


        }
        catch{


            continue;


        }


    }



    return result;


}

// ==================================================
// USDC TRANSFER
// User transfers USDC to Payment Wallet
// ==================================================