# USDC Payment Integration - Complete Implementation Guide

## 📋 OVERVIEW

This implementation adds USDC payments to two key flows:
1. **Redeem RTB**: Users pay 20 USDC to redeem RTB → RTT
2. **Marketplace Buy**: Buyers pay USDC directly to sellers (85%) and marketplace fee (15%)

All USDC transfers happen on Avalanche Fuji testnet with 6 decimals.

---

## 🏗️ ARCHITECTURE

### Smart Contracts

#### FIFARTBMarketplace.sol (NEW)
- **createListing(tokenId, price)**: Seller lists RTB
- **cancelListing(tokenId)**: Seller cancels listing
- **buy(tokenId)**: Buyer purchases RTB
  - Transfers 85% USDC to seller
  - Transfers 15% USDC to treasury
  - Transfers RTB to buyer (atomic transaction)
- Fee: 15% (configurable via feePercentage = 1500)

**Key Features:**
- ReentrancyGuard for safety
- Listing struct: seller, tokenId, price, active, createdAt
- Atomic USDC + RTB transfer in one transaction

#### FIFARTB.sol (UPDATED)
- Added `approvedMarketplace` address field
- Added `setApprovedMarketplace(address)` function
- Modified `_update()` to allow Marketplace contract transfers
- Added `MarketplaceApproved` event

This allows Marketplace contract to call `transferFrom()` without using the restricted `transferRTB()` function.

#### FIFARTT.sol (NO CHANGES)
- Remains unchanged - mint RTT only when RTB redeems

---

## 📝 BACKEND CHANGES

### Payment Service (`backend/src/services/paymentService.ts`)

**New Function: `verifyRedeemPayment()`**
```typescript
export async function verifyRedeemPayment(
    userAddress: string,
    rtbTokenId: number,
    matchId: string,
    paymentTxHash: string,
    expectedAmount: number = 20
)
```

- Verifies USDC transfer to PAYMENT_WALLET
- Uses custom USDC.e transfer event signature (Avalanche Fuji)
- Prevents duplicate payment processing (txHash idempotency)
- Creates/updates Order in database
- Returns payment verification status

### Routes (`backend/src/routes/`)

**New File: `marketplaceRoutes.ts`**
- `GET /marketplace/fee-info`: Returns fee configuration (15%)
- `POST /marketplace/get-listing`: Query listing details
- `POST /marketplace/verify-sale`: Verify marketplace sale tx

**Updated: `paymentRoutes.ts`**
- Added `POST /payment/verify-redeem-payment` route
- Calls `verifyRedeemPayment()` controller

### Configuration

**Required .env Variables:**
```
USDC_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
PAYMENT_WALLET=0x8c75a2eC18f3B5Dcca94C8aF239AcdB01109dA64
USDC_DECIMALS=6
MARKETPLACE_ADDRESS=(set after deployment)
```

---

## 🎨 FRONTEND CHANGES

### New ABI Files

**`frontend/src/abi/FIFARTBMarketplace.json`**
- Complete Marketplace contract ABI
- All function and event signatures

**`frontend/src/abi/USDC.json`**
- ERC20 token interface
- approve, transfer, transferFrom, balanceOf, allowance

### Contract Service (`frontend/src/services/contract.ts`)

**New Functions:**

**Listing Management:**
- `createMarketplaceListing(tokenId, priceUSDC)`: Create listing
- `cancelMarketplaceListing(tokenId)`: Cancel listing
- `getMarketplaceListing(tokenId)`: Get listing details
- `isMarketplaceListingActive(tokenId)`: Check status

**USDC Operations:**
- `approveUSDCForMarketplace(amountUSDC)`: Approve spending
- `getUSDCAllowance(userAddress)`: Check allowance
- `getUSDCBalance(userAddress)`: Check balance
- `transferUSDC(recipientAddress, amountUSDC)`: Transfer for Redeem

**Marketplace Purchase:**
- `buyFromMarketplace(tokenId)`: Atomic buy operation

**Helper:**
- `calculateMarketplaceFee(priceUSDC)`: Calculate 15% fee

### Updated Components

**RedeemCheckout.tsx**
- NEW FLOW: Payment → Verification → Redeem → Success
- Displays 20 USDC fee
- User calls `transferUSDC()` to PAYMENT_WALLET
- Backend verifies payment
- Frontend calls `redeem()` contract function
- Displays both payment and redeem tx hashes

**Marketplace.tsx**
- NEW: Blockchain-integrated seller side
  - `createMarketplaceListing()` creates listing on-chain
  - Shows 85/15% fee split
  - Pulls owned RTBs from contract

- NEW: Blockchain-integrated buyer side
  - `buyFromMarketplace()` executes atomic buy
  - Automatic USDC approval if needed
  - Displays success/error states
  - Shows real-time USDC balance

### Environment Variables Required

**frontend/.env**
```
VITE_MARKETPLACE_ADDRESS=(deployed address)
VITE_USDC_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
VITE_PAYMENT_WALLET=0x8c75a2eC18f3B5Dcca94C8aF239AcdB01109dA64
```

---

## 🚀 DEPLOYMENT SEQUENCE

### 1. Compile Smart Contracts
```bash
cd smart_contract
npm install
npx hardhat compile
```

### 2. Deploy Contracts
```bash
# Configure .env in smart_contract/:
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
PRIVATE_KEY=<your-wallet-private-key>
USDC_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
PAYMENT_WALLET=<treasury-address>

# Run deployment script
npx hardhat run scripts/deploy.js --network fuji
```

**Output:** Will update all .env files with deployed addresses

### 3. Verify Contracts (Optional)
```bash
npx hardhat run scripts/verify.js --network fuji
```

### 4. Build & Test Backend
```bash
cd backend
npm install
npm run build
npm run test  # If available
npm start
```

### 5. Build & Test Frontend
```bash
cd frontend
npm install

# Update .env with deployed Marketplace address
echo "VITE_MARKETPLACE_ADDRESS=0x..." >> .env

npm run build
npm run dev
```

---

## 🧪 TESTING GUIDE

### Test Redeem Flow (20 USDC)

**Prerequisites:**
- User has RTB token in wallet
- User has 20+ USDC in wallet
- USDC approved for transfers

**Steps:**
1. Go to Collection page
2. Click "Redeem" on an RTB
3. Confirm RedeemCheckout shows:
   - Match info
   - **"Phí Redeem (USDC): 20 USDC"**
   - Seat input field
4. Click "Thanh toán & Redeem"
5. MetaMask pops up → Approve USDC transfer
6. Wait for USDC tx confirmed
7. Verify backend logs: `[VERIFY REDEEM PAYMENT] ✓ Payment verified`
8. RTB automatically burns, RTT mints
9. Success page shows both tx hashes

**Verification:**
- ✅ Order created with paymentTxHash
- ✅ Order.status = "PAID" after payment
- ✅ Order.userId preserved (not zero address)
- ✅ RTB removed from Collection
- ✅ RTT appears in My Tickets
- ✅ Seat and Category saved in Order

### Test Marketplace Buy Flow

**Prerequisites:**
- Seller has RTB in wallet
- Buyer has 50+ USDC in wallet
- RTB allowed for Marketplace transfers

**Seller Side:**
1. Go to Marketplace
2. Select RTB from dropdown
3. Enter price: 50 USDC
4. Click "Đăng Listing"
5. MetaMask: Approve transaction
6. Wait for tx confirmed
7. Verify listing created on-chain

**Buyer Side:**
1. Same Marketplace page, scroll to Buyer panel
2. See seller's listing:
   - RTB #X
   - **Price: 50 USDC**
   - **Seller receives: 42.5 USDC**
   - **Fee: 7.5 USDC**
3. Click "Mua"
4. Confirm modal shows breakdown
5. Click "Mua USDC"
6. If first buy: MetaMask approve USDC for Marketplace
7. Then: MetaMask confirm buy transaction
8. Wait for tx confirmed
9. Success page shows tx hash

**Verification:**
- ✅ Buyer's USDC balance decreased by 50
- ✅ Seller's USDC balance increased by 42.5
- ✅ Treasury received 7.5 USDC
- ✅ RTB owner changed to buyer
- ✅ Listing marked inactive
- ✅ Buyer cannot buy same listing again

### Failure Cases

**Redeem with insufficient USDC:**
- Error: "Insufficient USDC balance"
- Order not created

**Redeem with payment rejected:**
- MetaMask rejected tx
- Order not created
- Can retry

**Marketplace buy without approval:**
- System auto-approves USDC first
- Then proceeds to buy

**Marketplace buy with insufficient balance:**
- Button disabled if balance < price
- Cannot click buy

---

## 📊 DATABASE UPDATES

### Orders Table

**New Columns Added:**
- `paymentTxHash` (VARCHAR): USDC transfer tx hash
- `paymentVerifiedAt` (DATETIME): When payment was verified

**Updated Behavior:**
- Redeem orders: paymentTxHash populated before redeem
- Purchase orders: paymentTxHash populated before mint
- txHash idempotency prevents double-processing

### Migration

Run migration to add columns:
```sql
-- File: backend/migrations/001_add_usdc_payment_columns.sql
-- Already included in repo
```

---

## 🔗 CONTRACT ADDRESSES (After Deployment)

Deployed to Avalanche Fuji:
```
FIFARTB: 0x... (from deploy output)
FIFARTT: 0x... (from deploy output)
FIFARTBMarketplace: 0x... (from deploy output)
USDC: 0x5425890298aed601595a70AB815c96711a31Bc65
Payment Wallet: 0x8c75a2eC18f3B5Dcca94C8aF239AcdB01109dA64
```

---

## ⚠️ SECURITY CONSIDERATIONS

1. **ReentrancyGuard**: Marketplace uses OpenZeppelin ReentrancyGuard
2. **Approval Flow**: Buyer must approve USDC spending before buying
3. **Atomic Transfers**: USDC + RTB transfers in single transaction
4. **Event Verification**: Backend verifies USDC transfer via event logs
5. **Idempotency**: txHash prevents duplicate payment processing
6. **Access Control**: Only owner can redeem, only seller can cancel

---

## 🐛 TROUBLESHOOTING

### "USDC transfer not found"
- Check USDC contract address in .env
- Verify PAYMENT_WALLET address
- Ensure user transferred exact amount
- Check Fuji block explorer for tx

### "Marketplace address not configured"
- Run deploy script to populate .env
- Restart backend and frontend
- Clear browser cache

### "Insufficient USDC allowance"
- User needs to approve Marketplace
- System auto-approves before buy
- May need to increase allowance if partial spend

### Order showing zero address userId
- Backend bug - should not happen
- userId should come from Order creation, not event
- Check backend logs for issue

---

## 📚 FILE REFERENCE

### Smart Contracts
- `smart_contract/contracts/FIFARTBMarketplace.sol` (NEW)
- `smart_contract/contracts/FIFARTB.sol` (UPDATED)
- `smart_contract/scripts/deploy.js` (UPDATED)

### Backend
- `backend/src/services/paymentService.ts` (verifyRedeemPayment)
- `backend/src/routes/marketplaceRoutes.ts` (NEW)
- `backend/src/controllers/paymentController.ts` (verifyRedeemPayment)
- `backend/src/routes/paymentRoutes.ts` (verify-redeem-payment)
- `backend/src/app.ts` (marketplace routes)

### Frontend
- `frontend/src/abi/FIFARTBMarketplace.json` (NEW)
- `frontend/src/abi/USDC.json` (NEW)
- `frontend/src/services/contract.ts` (Marketplace functions)
- `frontend/src/pages/RedeemCheckout.tsx` (USDC payment flow)
- `frontend/src/pages/Marketplace.tsx` (Blockchain integration)

---

## ✅ IMPLEMENTATION CHECKLIST

- [x] FIFARTBMarketplace contract created
- [x] FIFARTB contract updated for Marketplace
- [x] Deploy script handles Marketplace
- [x] Backend payment service verifies Redeem USDC
- [x] Marketplace routes added
- [x] Frontend ABIs added
- [x] Contract service functions added
- [x] RedeemCheckout USDC flow implemented
- [x] Marketplace blockchain integration
- [ ] Smart contract compilation & tests
- [ ] Backend build & tests
- [ ] Frontend build & tests
- [ ] End-to-end testing on Fuji
- [ ] Production deployment

---

## 🚀 NEXT STEPS

1. **Compile Contracts**
   ```bash
   cd smart_contract && npx hardhat compile
   ```

2. **Test Locally** (if test network available)
   ```bash
   npm run test
   ```

3. **Deploy to Fuji**
   ```bash
   npx hardhat run scripts/deploy.js --network fuji
   ```

4. **Build & Test Backend & Frontend**
   ```bash
   cd backend && npm run build
   cd frontend && npm run build
   ```

5. **Run E2E Tests**
   - Test Redeem flow with real USDC
   - Test Marketplace buy with real USDC
   - Verify all funds flow correctly

6. **Deploy to Production** (when ready)
   - Update contract addresses in production env
   - Deploy updated frontend
   - Monitor transactions and balances

---

**Last Updated:** 2026-08-16
**Status:** ✅ Implementation Complete - Ready for Testing
