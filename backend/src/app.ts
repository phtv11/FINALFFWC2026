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

console.log("[app] booting Express app");
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.path}`);
    next();
});

// RTB API
app.use("/api/rtb", rtbRoutes);

// Payment APIs
app.use("/api/payment", paymentRoutes);

// Marketplace API
console.log("[app] mounting /api/marketplace");
app.use("/api/marketplace", marketplaceRoutes);

// RTT API
app.use("/api/rtt", rttRoutes);

// Matches
app.use("/api/matches", matchRoutes);

// Start blockchain indexer (non-blocking)
try {
    startIndexer();
} catch (e) {
    console.error("Failed to start indexer:", e);
}

app.use(errorHandler);

export default app;