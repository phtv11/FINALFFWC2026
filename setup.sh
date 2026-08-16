#!/bin/bash
# USDC Payment Implementation - Quick Start Script

echo "======================================"
echo "🚀 FIFA Web3 USDC Integration Setup"
echo "======================================"
echo ""

# Step 1: Smart Contracts
echo "📦 Step 1: Installing smart contract dependencies..."
cd smart_contract
npm install
npx hardhat compile

echo ""
echo "✅ Smart contracts compiled successfully"
echo ""

# Step 2: Backend
echo "📦 Step 2: Building backend service..."
cd ../backend
npm install
npm run build

echo ""
echo "✅ Backend built successfully"
echo ""

# Step 3: Frontend
echo "📦 Step 3: Building frontend application..."
cd ../frontend
npm install
npm run build

echo ""
echo "✅ Frontend built successfully"
echo ""

# Deployment Instructions
echo "======================================"
echo "📋 NEXT STEPS:"
echo "======================================"
echo ""
echo "1. Deploy smart contracts to Avalanche Fuji:"
echo "   cd smart_contract"
echo "   npx hardhat run scripts/deploy.js --network fuji"
echo ""
echo "2. Verify deployment updated .env files with:"
echo "   - MARKETPLACE_ADDRESS"
echo "   - USDC_ADDRESS"
echo "   - PAYMENT_WALLET"
echo ""
echo "3. Start backend server:"
echo "   cd backend"
echo "   npm start"
echo ""
echo "4. Start frontend dev server:"
echo "   cd frontend"
echo "   npm run dev"
echo ""
echo "5. Test flows:"
echo "   - Redeem RTB: RedeemCheckout page (20 USDC)"
echo "   - Marketplace: Marketplace page (create listing + buy)"
echo ""
echo "======================================"
echo "📚 Documentation:"
echo "======================================"
echo "- IMPLEMENTATION_SUMMARY.md - Overview of all changes"
echo "- USDC_IMPLEMENTATION_GUIDE.md - Detailed implementation guide"
echo ""
echo "🎉 Setup script complete!"
