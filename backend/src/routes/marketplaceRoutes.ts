import { Router } from "express";
import {
    getMarketplaceListingByIdController,
    getMarketplaceListingsController,
    getMarketplaceOwnerController,
} from "../controllers/marketplaceController";

const router = Router();

router.get("/listings", getMarketplaceListingsController);
router.get("/listings/:id", getMarketplaceListingByIdController);
router.get("/owner/:address", getMarketplaceOwnerController);

export default router;
