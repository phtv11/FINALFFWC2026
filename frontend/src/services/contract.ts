import { ethers } from "ethers";

import FIFARTB from "../abi/FIFARTB.json";
import FIFARTT from "../abi/FIFARTT.json";
import USDC from "../abi/USDC.json";



// ==============================
// Contract Address
// ==============================

const RTB_ADDRESS =
    import.meta.env.VITE_RTB_ADDRESS;


const RTT_ADDRESS =
    import.meta.env.VITE_RTT_ADDRESS;

const USDC_ADDRESS =
    import.meta.env.VITE_USDC_ADDRESS;

const PAYMENT_WALLET =
    import.meta.env.VITE_PAYMENT_WALLET;

const USDC_DECIMALS =
    parseInt(import.meta.env.VITE_USDC_DECIMALS || "6");



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


// ==============================
// Lấy contract USDC có signer
// Dùng approve + transfer
// ==============================

async function getUSDCContract(){


    const signer =
        await getSigner();



    return new ethers.Contract(

        USDC_ADDRESS,

        USDC as any,

        signer

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
// USDC PAYMENT
// Approve & Transfer USDC
// ==================================================

export async function checkUSDCAllowance(
    userAddress: string,
    amount: number
): Promise<boolean> {
    const provider = getProvider();
    const contract = new ethers.Contract(
        USDC_ADDRESS,
        USDC as any,
        provider
    );

    const allowance = await contract.allowance(
        userAddress,
        PAYMENT_WALLET
    );

    const amountWei = ethers.parseUnits(
        amount.toString(),
        USDC_DECIMALS
    );

    return allowance >= amountWei;
}

export async function approveUSDC(amount: number) {
    const contract = await getUSDCContract();

    const amountWei = ethers.parseUnits(
        amount.toString(),
        USDC_DECIMALS
    );

    const tx = await contract.approve(
        PAYMENT_WALLET,
        amountWei
    );

    await tx.wait();

    return tx.hash;
}

export async function transferUSDC(
    to: string,
    amount: number
) {
    const contract = await getUSDCContract();

    const amountWei = ethers.parseUnits(
        amount.toString(),
        USDC_DECIMALS
    );

    const tx = await contract.transfer(to, amountWei);

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