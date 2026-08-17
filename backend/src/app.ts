import express from "express";
import cors from "cors";

import rtbRoutes from "./routes/rtbRoutes";
import rttRoutes from "./routes/rttRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import matchRoutes from "./routes/matchRoutes";
import marketplaceRoutes from "./routes/marketplaceRoutes";
import errorHandler from "./middleware/errorHandler";
import { startIndexer } from "./services/indexerService";

const app = express();

app.use(cors());
app.use(express.json());

// RTB API
app.use("/api/rtb", rtbRoutes);

// Payment APIs
app.use("/api/payment", paymentRoutes);
console.log("MARKETPLACE ROUTES LOADED");
// RTT API
app.use("/api/rtt", rttRoutes);

// Matches
app.use("/api/matches", matchRoutes);

// Marketplace
app.use("/api/marketplace", marketplaceRoutes);

// Start blockchain indexer (non-blocking)
try {
    startIndexer();
} catch (e) {
    console.error("Failed to start indexer:", e);
}

app.use(errorHandler);

export default app;