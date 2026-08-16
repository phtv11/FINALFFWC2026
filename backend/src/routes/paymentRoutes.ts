import { Router } from "express";


import {
    pay,
    getOrder,
    getUserOrders,
    verifyPayment,
    submitRedeemTx,
    updateOrderStatus
} from "../controllers/paymentController";

const router = Router();

// Tạo order
router.post("/pay", pay);

// Lấy order
router.get("/order/:orderId", getOrder);

// Lấy orders của user
router.get("/user/:userAddress", getUserOrders);

// Verify USDC payment & mint RTB
router.post("/verify-payment", verifyPayment);

// FE gửi txHash sau redeem
router.post("/redeem", submitRedeemTx);

// cập nhật trạng thái
router.put("/order/status", updateOrderStatus);

export default router;