import { Router } from "express";
import * as marketplaceController from "../controllers/marketplaceController";

const router = Router();

console.log("[marketplaceRoutes] registering routes");

/**
 * @route POST /api/marketplace/listings
 * @desc Seller creates a new listing
 * @access Public
 */
router.post("/listings", marketplaceController.createListing);

/**
 * @route GET /api/marketplace/listings
 * @desc Get all active listings
 * @access Public
 */
console.log("[marketplaceRoutes] registering GET /listings");
router.get("/listings", marketplaceController.getActiveListings);

/**
 * @route GET /api/marketplace/listings/:id
 * @desc Get a specific listing by ID
 * @access Public
 */
router.get("/listings/:id", marketplaceController.getListingById);

/**
 * @route POST /api/marketplace/purchase
 * @desc Buyer initiates purchase (records payment tx)
 * @access Public
 */
router.post("/purchase", marketplaceController.initiatePurchase);

/**
 * @route POST /api/marketplace/verify-payment
 * @desc Backend verifies USDC payment from blockchain
 * @access Public (but caller should be trusted backend process)
 */
router.post("/verify-payment", marketplaceController.verifyPayment);

/**
 * @route POST /api/marketplace/confirm-transfer
 * @desc Confirm RTB transfer and mark listing as sold
 * @access Public (but caller should be trusted backend process)
 */
router.post("/confirm-transfer", marketplaceController.confirmTransfer);

/**
 * @route POST /api/marketplace/cancel
 * @desc Seller cancels a listing
 * @access Public
 */
router.post("/cancel", marketplaceController.cancelListing);

export default router;
