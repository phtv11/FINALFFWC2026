import { ethers } from "ethers";
import dotenv from "dotenv";
import { provider } from "../config/blockchain";
import { connectDB } from "../config/database";
import RTB from "../contracts/FIFARTB.json";
import {
    createOrder,
    findOrderById,
    findOrderByIdempotencyKey,
    findOrderByRtbTokenId,
    findOrderByPaymentTxHash,
    updateOrderStatus as updateOrderStatusRepo,
    updateOrderAfterPaymentVerification,
    updateOrderAfterMint,
    OrderRow
} from "../repositories/orderRepository";
import * as rtbService from "./rtbService";

dotenv.config({ override: true });



// ================================
// Tạo Order khi mua Pack
// hoặc UPDATE khi Redeem RTB
// ================================

export async function pay(
    userAddress: string,
    rtbTokenId: number | null | undefined,
    matchId: string,
    category: string | null | undefined,
    seat: string | null | undefined,
    price: number,
    idempotencyKey?: string
) {
    if (!userAddress) throw new Error("Thiếu địa chỉ user");
    if (!matchId) throw new Error("Match không hợp lệ");
    if (price <= 0) throw new Error("Giá vé không hợp lệ");

    // CASE 1: PURCHASE flow (rtbTokenId = null) → CREATE Order
    if (!rtbTokenId) {
        // Check idempotency
        if (idempotencyKey) {
            const existing = await findOrderByIdempotencyKey(idempotencyKey);
            if (existing) {
                return {
                    message: "Order đã tồn tại",
                    orderId: existing.id,
                    status: existing.status
                };
            }
        }

        const orderId = `ORDER_${Date.now()}`;
        const order: OrderRow = {
            id: orderId,
            userId: userAddress,
            matchId,
            category: null,  // NULL khi mua (chưa redeem)
            seat: null,      // NULL khi mua (chưa redeem)
            price,
            status: "PENDING",
            rtbTokenId: null,  // chưa mint RTB
            rttTokenId: null,
            txHash: null,
            idempotencyKey: idempotencyKey || null,
            createdAt: new Date()
        };

        await createOrder(order);

        return {
            message: "Tạo order thành công",
            orderId,
            status: "PENDING"
        };
    }

    // CASE 2: REDEEM flow (rtbTokenId != null) → UPDATE Order
    // Tìm Order theo rtbTokenId
    const existingOrder = await findOrderByRtbTokenId(rtbTokenId);
    if (!existingOrder) {
        throw new Error(`Không tìm thấy order cho RTB #${rtbTokenId}. Vui lòng mua Pack trước.`);
    }

    // Không tạo Order mới, chỉ cập nhật category/seat
    // Nếu user gọi lần 2 với cùng rtbTokenId, sẽ update category/seat lại (idempotent)
    const updatedOrder = await updateOrderStatusRepo(
        existingOrder.id,
        existingOrder.status,
        undefined,
        category,
        seat
    );

    return {
        message: "Order cập nhật thành công",
        orderId: existingOrder.id,
        status: existingOrder.status
    };
}





// ================================
// Lấy Order
// ================================

export async function getOrder(orderId: string) {
    return await findOrderById(orderId);
}





// ================================
// Nhận txHash sau khi user redeem
//
// Frontend:
// MetaMask redeem()
//        |
//        v
// txHash gửi backend
//
// Backend:
// đọc event RedeemedToRTT
// update order với holder từ blockchain
// ================================


export async function processRedeemTx(
    txHash:string
){


    if(!txHash)
        throw new Error(
            "Thiếu transaction hash"
        );



    const receipt =
        await provider.getTransactionReceipt(
            txHash
        );



    if(!receipt)
        throw new Error(
            "Transaction chưa được xác nhận"
        );



    const rtbInterface =
        new ethers.Interface(
            RTB.abi
        );



    let rttTokenId:number | undefined;

    let rtbTokenId:number | undefined;

    let holder:string | undefined;



    for(
        const log of receipt.logs
    ){

        try {


            const parsed =
                rtbInterface.parseLog({
                    topics:
                    log.topics as string[],

                    data:
                    log.data
                });



            if(
                parsed &&
                parsed.name ===
                "RedeemedToRTT"
            ){


                rtbTokenId =
                    Number(
                        parsed.args.rtbTokenId
                    );


                rttTokenId =
                    Number(
                        parsed.args.rttTokenId
                    );

                // Get holder from blockchain event (source of truth)
                holder =
                    String(
                        parsed.args.holder ?? parsed.args[1]
                    );


            }


        }
        catch{

            continue;

        }

    }



    if(
        !rtbTokenId ||
        !rttTokenId ||
        !holder
    ){

        throw new Error(
            "Không tìm thấy event RedeemedToRTT hoặc holder"
        );

    }



    const order = await findOrderByRtbTokenId(rtbTokenId);

    if(!order)
        throw new Error(
            "Không tìm thấy order"
        );



    // Update order với:
    // - rttTokenId
    // - userId = holder (from blockchain, source of truth)
    // - status = REDEEMED
    const updated = await updateOrderStatusRepo(
        order.id,
        "REDEEMED",
        rttTokenId
    );

    if (!updated) {
        throw new Error("Không thể cập nhật order");
    }

    // Update userId to holder if it changed due to transfer
    if (updated.userId !== holder) {
        // Also update userId
        const pool = await connectDB();
        await pool.request()
            .input("id", order.id)
            .input("userId", holder)
            .query(`
                UPDATE [dbo].[orders]
                SET [userId] = @userId
                WHERE [id] = @id;
            `);
        
        // Return updated order with new userId
        return await findOrderById(order.id);
    }

    return updated;

}





// ================================
// Verify USDC Payment for Redeem
// ================================

export async function verifyRedeemPayment(
    userAddress: string,
    rtbTokenId: number,
    matchId: string,
    paymentTxHash: string,
    expectedAmount: number = 20 // Default 20 USDC for redeem
) {
    if (!userAddress) throw new Error("Thiếu địa chỉ user");
    if (!rtbTokenId) throw new Error("RTB Token ID không hợp lệ");
    if (!matchId) throw new Error("Match không hợp lệ");
    if (!paymentTxHash) throw new Error("Thiếu payment transaction hash");
    if (expectedAmount <= 0) throw new Error("Số tiền không hợp lệ");

    // Check if payment tx hash has been used
    const existingOrder = await findOrderByPaymentTxHash(paymentTxHash);
    if (existingOrder) {
        throw new Error("Payment transaction hash đã được sử dụng");
    }

    // Verify USDC payment using existing function
    // Note: This will throw if payment is not valid
    const USDC_ADDRESS = process.env.USDC_ADDRESS;
    const PAYMENT_WALLET = process.env.PAYMENT_WALLET;
    const USDC_DECIMALS = parseInt(process.env.USDC_DECIMALS || "6");

    if (!USDC_ADDRESS || !PAYMENT_WALLET) {
        throw new Error("USDC configuration không hoàn chỉnh");
    }

    console.log(`[VERIFY REDEEM PAYMENT] txHash: ${paymentTxHash}`);
    console.log(`[VERIFY REDEEM PAYMENT] userAddress: ${userAddress}`);
    console.log(`[VERIFY REDEEM PAYMENT] rtbTokenId: ${rtbTokenId}`);
    console.log(`[VERIFY REDEEM PAYMENT] expectedAmount: ${expectedAmount} USDC`);

    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(paymentTxHash);
    if (!receipt) {
        throw new Error("Transaction chưa được xác nhận");
    }

    if (!receipt.status) {
        throw new Error("Transaction thất bại");
    }

    // Verify USDC Transfer
    const transferEventSignature = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const expectedAmount_uint256 = BigInt(expectedAmount) * BigInt(10 ** USDC_DECIMALS);

    let foundTransfer = false;

    for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];

        // Check if log is from USDC contract
        if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
            continue;
        }

        // Check if log is Transfer event
        if (log.topics[0] !== transferEventSignature) {
            continue;
        }

        // Parse Transfer event
        const from = "0x" + log.topics[1].slice(-40);
        const to = "0x" + log.topics[2].slice(-40);
        const transferAmount = BigInt(log.data);

        // Verify sender = userAddress
        if (from.toLowerCase() !== userAddress.toLowerCase()) {
            continue;
        }

        // Verify receiver = PAYMENT_WALLET
        if (to.toLowerCase() !== PAYMENT_WALLET.toLowerCase()) {
            continue;
        }

        // Verify amount
        if (transferAmount !== expectedAmount_uint256) {
            continue;
        }

        console.log(`[VERIFY REDEEM PAYMENT] ✓ Payment verified successfully!`);
        foundTransfer = true;
        break;
    }

    if (!foundTransfer) {
        throw new Error(
            `USDC transfer not found: expected ${expectedAmount} USDC from ${userAddress} to ${PAYMENT_WALLET}`
        );
    }

    // Find existing order for this RTB
    const existingRTBOrder = await findOrderByRtbTokenId(rtbTokenId);
    
    let orderId: string;
    if (existingRTBOrder) {
        orderId = existingRTBOrder.id;
        // Update existing order with payment info
        await updateOrderAfterPaymentVerification(orderId, paymentTxHash);
    } else {
        // Create new order for redeem
        orderId = `REDEEM_${Date.now()}`;
        const order: OrderRow = {
            id: orderId,
            userId: userAddress,
            matchId,
            category: null,
            seat: null,
            price: expectedAmount,
            status: "PENDING",
            rtbTokenId,
            paymentTxHash,
            paymentVerifiedAt: new Date(),
            idempotencyKey: paymentTxHash,
            createdAt: new Date()
        };
        await createOrder(order);
        await updateOrderAfterPaymentVerification(orderId, paymentTxHash);
    }

    return {
        orderId,
        status: "PAYMENT_VERIFIED",
        paymentTxHash,
        rtbTokenId,
        message: "Payment verified. Ready to redeem RTB."
    };
}


// ================================
// Verify USDC Payment
// ================================

export async function verifyUSDCPayment(
    userAddress: string,
    matchId: string,
    paymentTxHash: string,
    expectedAmount: number
) {
    if (!userAddress) throw new Error("Thiếu địa chỉ user");
    if (!matchId) throw new Error("Match không hợp lệ");
    if (!paymentTxHash) throw new Error("Thiếu payment transaction hash");
    if (expectedAmount <= 0) throw new Error("Số tiền không hợp lệ");

    // Check if payment tx hash has been used
    const existingOrder = await findOrderByPaymentTxHash(paymentTxHash);
    if (existingOrder) {
        throw new Error("Payment transaction hash đã được sử dụng");
    }

    // Get config from environment
    const USDC_ADDRESS = process.env.USDC_ADDRESS;
    const PAYMENT_WALLET = process.env.PAYMENT_WALLET;
    const USDC_DECIMALS = parseInt(process.env.USDC_DECIMALS || "6");

    if (!USDC_ADDRESS || !PAYMENT_WALLET) {
        throw new Error("USDC configuration không hoàn chỉnh");
    }

    console.log(`[VERIFY PAYMENT] txHash: ${paymentTxHash}`);
    console.log(`[VERIFY PAYMENT] userAddress: ${userAddress}`);
    console.log(`[VERIFY PAYMENT] expectedAmount: ${expectedAmount} USDC`);
    console.log(`[VERIFY PAYMENT] USDC_ADDRESS config: ${USDC_ADDRESS}`);
    console.log(`[VERIFY PAYMENT] PAYMENT_WALLET config: ${PAYMENT_WALLET}`);

    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(paymentTxHash);
    if (!receipt) {
        throw new Error("Transaction chưa được xác nhận");
    }

    if (!receipt.status) {
        throw new Error("Transaction thất bại");
    }

    console.log(`[VERIFY PAYMENT] Receipt status: ${receipt.status}`);
    console.log(`[VERIFY PAYMENT] Total logs in receipt: ${receipt.logs.length}`);

    // Log ALL contracts involved
    console.log(`[VERIFY PAYMENT] =========== ALL LOGS IN RECEIPT ===========`);
    const allContracts = new Set<string>();
    for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        allContracts.add(log.address.toLowerCase());
        console.log(`[VERIFY PAYMENT] Log ${i}: contract=${log.address}, topics=${log.topics.length}`);
        if (log.topics.length > 0) {
            console.log(`[VERIFY PAYMENT]   Topic[0]: ${log.topics[0]}`);
        }
    }
    console.log(`[VERIFY PAYMENT] All unique contracts: ${Array.from(allContracts).join(", ")}`);
    console.log(`[VERIFY PAYMENT] Looking for USDC contract: ${USDC_ADDRESS.toLowerCase()}`);
    console.log(`[VERIFY PAYMENT] Match found: ${allContracts.has(USDC_ADDRESS.toLowerCase())}`);
    console.log(`[VERIFY PAYMENT] ============================================`);

    // USDC.e on Avalanche Fuji uses custom Transfer event signature
    // NOT standard ERC20: 0xddf252ad1be2c89b69c2b068fc378daf4d6d4c8953b95fe52c97e9dda2e1872a
    // Custom USDC.e signature: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    const transferEventSignature = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const expectedAmount_uint256 = BigInt(expectedAmount) * BigInt(10 ** USDC_DECIMALS);

    console.log(`[VERIFY PAYMENT] Expected amount in wei: ${expectedAmount_uint256.toString()}`);

    let foundTransfer = false;
    let transferAmount = BigInt(0);

    // Iterate through logs to find USDC Transfer event
    for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        
        console.log(`[VERIFY PAYMENT] Log ${i}: address=${log.address}, topics.length=${log.topics.length}`);

        // Check if log is from USDC contract
        if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
            console.log(`[VERIFY PAYMENT]   - Skipping: contract address mismatch`);
            continue;
        }

        console.log(`[VERIFY PAYMENT]   ✓ Found USDC contract log`);
        console.log(`[VERIFY PAYMENT]   - topics[0]: ${log.topics[0]}`);

        // Check if log is Transfer event
        if (log.topics[0] !== transferEventSignature) {
            console.log(`[VERIFY PAYMENT]   - Skipping: not Transfer event`);
            continue;
        }

        console.log(`[VERIFY PAYMENT]   ✓ Found Transfer event`);

        // Parse Transfer event
        // topics[0] = event signature
        // topics[1] = from (indexed)
        // topics[2] = to (indexed)
        // data = value (uint256)

        const from = "0x" + log.topics[1].slice(-40);
        const to = "0x" + log.topics[2].slice(-40);
        transferAmount = BigInt(log.data);

        console.log(`[VERIFY PAYMENT]   - from: ${from}`);
        console.log(`[VERIFY PAYMENT]   - to: ${to}`);
        console.log(`[VERIFY PAYMENT]   - amount: ${transferAmount.toString()}`);

        // Verify sender = userAddress
        if (from.toLowerCase() !== userAddress.toLowerCase()) {
            console.log(`[VERIFY PAYMENT]   - Skipping: sender mismatch`);
            console.log(`[VERIFY PAYMENT]     Expected sender: ${userAddress.toLowerCase()}`);
            console.log(`[VERIFY PAYMENT]     Got sender:      ${from.toLowerCase()}`);
            continue;
        }

        console.log(`[VERIFY PAYMENT]   ✓ Sender matches`);

        // Verify receiver = PAYMENT_WALLET
        if (to.toLowerCase() !== PAYMENT_WALLET.toLowerCase()) {
            console.log(`[VERIFY PAYMENT]   - Skipping: receiver mismatch`);
            console.log(`[VERIFY PAYMENT]     Expected receiver: ${PAYMENT_WALLET.toLowerCase()}`);
            console.log(`[VERIFY PAYMENT]     Got receiver:      ${to.toLowerCase()}`);
            continue;
        }

        console.log(`[VERIFY PAYMENT]   ✓ Receiver matches`);

        // Verify amount
        if (transferAmount !== expectedAmount_uint256) {
            console.log(`[VERIFY PAYMENT]   - Skipping: amount mismatch`);
            console.log(`[VERIFY PAYMENT]     Expected: ${expectedAmount_uint256.toString()} (${expectedAmount} USDC)`);
            console.log(`[VERIFY PAYMENT]     Got:      ${transferAmount.toString()} (${(Number(transferAmount) / (10 ** USDC_DECIMALS)).toFixed(USDC_DECIMALS)} USDC)`);
            continue;
        }

        console.log(`[VERIFY PAYMENT]   ✓ Amount matches`);
        foundTransfer = true;
        break;
    }

    if (!foundTransfer) {
        console.error(`[VERIFY PAYMENT] ERROR: USDC transfer not found`);
        console.error(`[VERIFY PAYMENT] =========== DEBUG INFO ===========`);
        console.error(`[VERIFY PAYMENT] Looking for transfer FROM: ${userAddress.toLowerCase()}`);
        console.error(`[VERIFY PAYMENT] Looking for transfer TO: ${PAYMENT_WALLET.toLowerCase()}`);
        console.error(`[VERIFY PAYMENT] Looking for amount: ${expectedAmount_uint256.toString()} (${expectedAmount} USDC)`);
        console.error(`[VERIFY PAYMENT] USDC contract expected: ${USDC_ADDRESS.toLowerCase()}`);
        console.error(`[VERIFY PAYMENT] Total logs found in receipt: ${receipt.logs.length}`);
        
        // Log all transfer-like events for debugging
        let transferEventsFound = 0;
        for (let i = 0; i < receipt.logs.length; i++) {
            const log = receipt.logs[i];
            if (log.topics[0] === transferEventSignature) {
                transferEventsFound++;
                const from = "0x" + log.topics[1].slice(-40);
                const to = "0x" + log.topics[2].slice(-40);
                const amount = BigInt(log.data);
                console.error(`[VERIFY PAYMENT] Transfer event #${transferEventsFound}:`);
                console.error(`[VERIFY PAYMENT]   Contract: ${log.address}`);
                console.error(`[VERIFY PAYMENT]   From: ${from}`);
                console.error(`[VERIFY PAYMENT]   To: ${to}`);
                console.error(`[VERIFY PAYMENT]   Amount: ${amount.toString()}`);
            }
        }
        console.error(`[VERIFY PAYMENT] Total Transfer events found: ${transferEventsFound}`);
        console.error(`[VERIFY PAYMENT] ====================================`);
        
        throw new Error(
            `USDC transfer not found: expected ${expectedAmount} USDC from ${userAddress} to ${PAYMENT_WALLET}`
        );
    }

    console.log(`[VERIFY PAYMENT] ✓ Payment verified successfully!`);

    // Payment verified! Now create/update order and mint RTB
    const orderId = `ORDER_${Date.now()}`;
    const order: OrderRow = {
        id: orderId,
        userId: userAddress,
        matchId,
        category: "Standard",
        seat: "",
        price: expectedAmount,
        status: "PENDING",
        paymentTxHash,
        paymentVerifiedAt: null,
        idempotencyKey: paymentTxHash, // Use paymentTxHash as idempotency key to avoid duplicate NULL values
        createdAt: new Date()
    };

    await createOrder(order);

    // Update order after payment verification
    await updateOrderAfterPaymentVerification(orderId, paymentTxHash);

    // Mint RTB
    const mintResult = await rtbService.mintRTB(userAddress, matchId);

    // Update order after mint
    await updateOrderAfterMint(orderId, mintResult.tokenId, mintResult.txHash);

    // Return complete order info
    const finalOrder = await findOrderById(orderId);

    return {
        orderId,
        status: "COMPLETED",
        paymentTxHash,
        rtbTokenId: mintResult.tokenId,
        mintTxHash: mintResult.txHash,
        order: finalOrder
    };
}


// ================================
// Update Order thủ công
// dùng cho backend listener sau này
// ================================

export async function updateOrderStatus(

    orderId:string,

    status:string,

    rttTokenId?:number

){
    return await updateOrderStatusRepo(
        orderId,
        status,
        rttTokenId
    );
}