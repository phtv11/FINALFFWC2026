import { Request, Response, NextFunction } from "express";

import * as paymentService
from "../services/paymentService";

import { findOrdersByUser } from "../repositories/orderRepository";


// =================================
// Tạo Order
// =================================

export async function pay(

    req:Request,

    res:Response,

    next:NextFunction

){

    try{


        const {
            userAddress,
            rtbTokenId,
            matchId,
            category,
            seat,
            price,
            idempotencyKey
        } = req.body;

        const result =
            await paymentService.pay(
                userAddress,
                rtbTokenId,
                matchId,
                category,
                seat,
                price,
                idempotencyKey
            );



        res.status(200).json({

            success:true,

            data:result

        });



    }
    catch(error){


        next(error);


    }

}





// =================================
// Lấy Order
// =================================

export async function getOrder(

    req:Request,

    res:Response,

    next:NextFunction

){

    try{


        const {
            orderId
        } = req.params;



        if(typeof orderId !== "string"){

            return res.status(400).json({

                success:false,

                message:
                "Order ID không hợp lệ"

            });

        }



        const order =
            await paymentService.getOrder(
                orderId
            );



        if(!order){

            return res.status(404).json({

                success:false,

                message:
                "Không tìm thấy order"

            });

        }



        res.json({

            success:true,

            data:order

        });



    }
    catch(error){


        next(error);


    }

}





export async function getUserOrders(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const userAddress = String(req.params.userAddress || "").trim();

        if (!userAddress) {
            return res.status(400).json({
                success: false,
                message: "Wallet address không hợp lệ"
            });
        }

        const orders = await findOrdersByUser(userAddress);

        return res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        next(error);
    }
}

// =================================
// Verify USDC Payment & Mint RTB
// =================================

export async function verifyPayment(

    req:Request,

    res:Response,

    next:NextFunction

){

    try{

        const {
            userAddress,
            matchId,
            paymentTxHash,
            amount
        } = req.body;

        if (!userAddress || typeof userAddress !== "string") {
            return res.status(400).json({
                success: false,
                message: "User address không hợp lệ"
            });
        }

        if (!matchId || typeof matchId !== "string") {
            return res.status(400).json({
                success: false,
                message: "Match ID không hợp lệ"
            });
        }

        if (!paymentTxHash || typeof paymentTxHash !== "string") {
            return res.status(400).json({
                success: false,
                message: "Payment transaction hash không hợp lệ"
            });
        }

        if (typeof amount !== "number" || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Amount không hợp lệ"
            });
        }

        const result =
            await paymentService.verifyUSDCPayment(
                userAddress,
                matchId,
                paymentTxHash,
                amount
            );

        res.status(200).json({
            success: true,
            data: result
        });

    }
    catch(error){

        next(error);

    }

}




// =================================
// Nhận txHash redeem từ FE
// =================================

export async function submitRedeemTx(

    req:Request,

    res:Response,

    next:NextFunction

){

    try{


        const {
            txHash,
            paymentTxHash
        } = req.body;



        const result =
            await paymentService.processRedeemTx(
                txHash,
                paymentTxHash
            );



        res.status(200).json({

            success:true,

            data:result

        });



    }
    catch(error){


        next(error);


    }

}





// =================================
// Update Order
// =================================

export async function updateOrderStatus(

    req:Request,

    res:Response,

    next:NextFunction

){

    try{


        const {

            orderId,

            status,

            rttTokenId


        } = req.body;



        const result =
            await paymentService.updateOrderStatus(

                orderId,

                status,

                rttTokenId

            );



        res.json({

            success:true,

            data:result

        });



    }
    catch(error){


        next(error);


    }

}