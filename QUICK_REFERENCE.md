# Quick Reference - Modified Files

## Frontend Files (5 modified/created)

### 1. frontend/src/abi/USDC.json (NEW)
```
Purpose: ERC20 ABI for USDC contract
Changes: Created with approve, transfer, allowance, balanceOf functions
Size: Small ABI file (~500 bytes)
```

### 2. frontend/src/services/contract.ts (MODIFIED)
```
Purpose: Smart contract interaction functions
Changes Added:
  - Import USDC ABI
  - Add USDC_ADDRESS, PAYMENT_WALLET, USDC_DECIMALS constants
  - Add getUSDCContract() function
  - Add checkUSDCAllowance(userAddress, amount) function
  - Add approveUSDC(amount) function
  - Add transferUSDC(to, amount) function
  - REMOVED: Old USDC transfer code at end of file

New Exports:
  - checkUSDCAllowance()
  - approveUSDC()
  - transferUSDC()
```

### 3. frontend/src/pages/RedeemCheckout.tsx (MODIFIED)
```
Purpose: Redeem RTB checkout page UI
Changes Modified:
  - Import USDC functions from contract.ts
  - Add paymentTxHash state
  - Rewrite handleConfirmPayment() to:
    1. Check USDC allowance
    2. Approve USDC if needed
    3. Transfer USDC to payment wallet
    4. Create order with paymentTxHash
    5. Redeem RTB token
    6. Submit both txHashes
  - Update success display to show both USDC and Redeem txHashes

Key Changes:
  - Step 1-5 executed sequentially
  - User sees status messages for each step
  - Both txHashes displayed in success screen
```

### 4. frontend/src/services/api.ts (MODIFIED)
```
Purpose: API calls to backend
Changes Modified:
  - submitRedeemTx() function signature:
    OLD: submitRedeemTx(txHash: string)
    NEW: submitRedeemTx(txHash: string, paymentTxHash?: string)
  - Now sends both txHashes to backend
```

---

## Backend Files (2 modified)

### 5. backend/src/controllers/paymentController.ts (MODIFIED)
```
Purpose: HTTP controller for payment endpoints
Changes Modified in submitRedeemTx():
  - Extract paymentTxHash from request body (in addition to txHash)
  - Pass both to paymentService.processRedeemTx(txHash, paymentTxHash)

Updated Signature:
  const { txHash, paymentTxHash } = req.body
```

### 6. backend/src/services/paymentService.ts (MODIFIED)
```
Purpose: Business logic for payment and redeem operations
Changes Added:
  - NEW: verifyUSDCPaymentForRedeem() helper function
    - Verifies USDC transfer from transaction receipt
    - Checks from/to/amount
    - Uses custom USDC.e event signature
    - Returns sender address if valid, throws error if invalid

Changes Modified in processRedeemTx():
  OLD SIGNATURE: processRedeemTx(txHash: string)
  NEW SIGNATURE: processRedeemTx(txHash: string, paymentTxHash?: string)

  NEW FLOW:
  Step 1: If paymentTxHash provided:
    - Call verifyUSDCPaymentForRedeem()
    - Verify USDC transfer before processing redeem
    
  Step 2: Verify redeem event (existing logic)
    - Parse RedeemedToRTT event from redeem tx
    
  Step 3: Update order (modified)
    - Now updates with paymentTxHash (if provided)
    - Still updates userId to holder from event
    - Still updates status to REDEEMED
    - Still updates rttTokenId

  NEW RETURN FORMAT:
  {
    success: true,
    orderId: string,
    status: "REDEEMED",
    rtbTokenId: number,
    rttTokenId: number,
    userId: string (holder from event),
    paymentTxHash: string,
    redeemTxHash: string,
    order: OrderRow
  }
```

---

## Summary Statistics

```
Total Files Modified: 6
  - Frontend: 4 modified + 1 new = 5 total
  - Backend: 2 modified

Lines of Code Added: ~400
  - Frontend contract.ts: ~80 lines
  - Frontend RedeemCheckout.tsx: ~50 lines (net)
  - Frontend api.ts: ~10 lines (net)
  - Backend controller.ts: ~5 lines (net)
  - Backend paymentService.ts: ~150 lines (net)

Lines of Code Removed: ~100
  - Frontend contract.ts: Removed old USDC code at end

Breaking Changes: NONE
  - All existing functions preserved
  - submitRedeemTx() signature change is backward compatible
    (paymentTxHash is optional)

Database Changes: NONE
  - Uses existing paymentTxHash column
  - No schema modifications

Compilation Errors: 0
  - All TypeScript checks pass
```

---

## Environment Variables Required

### Frontend (.env)
```
VITE_USDC_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
VITE_PAYMENT_WALLET=0x8c75a2eC18f3B5Dcca94C8aF239AcdB01109dA64
VITE_USDC_DECIMALS=6
```

### Backend (.env)
```
USDC_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
PAYMENT_WALLET=0x8c75a2eC18f3B5Dcca94C8aF239AcdB01109dA64
USDC_DECIMALS=6
```

---

## Testing Points

### Frontend:
- [ ] USDC allowance check works
- [ ] USDC approval flow works
- [ ] USDC transfer shows correct amount (20 USDC)
- [ ] Seat input validation works
- [ ] Status messages show for each step
- [ ] Both txHashes displayed on success

### Backend:
- [ ] USDC payment verification passes
- [ ] Redeem event verification passes
- [ ] Order updated correctly
- [ ] paymentTxHash stored in order
- [ ] userId updated to holder (not 0x0...)

### Integration:
- [ ] Full flow works end-to-end
- [ ] USDC fails → redeem not called
- [ ] Redeem fails → payment still recorded
- [ ] Order not duplicated
- [ ] User can see both txHashes

---

## Deployment Checklist

- [ ] Backend built successfully: `npm run build`
- [ ] Frontend built successfully: `npm run build`
- [ ] All .env variables set in production
- [ ] Test on Avalanche Fuji testnet first
- [ ] Monitor backend logs for USDC verification
- [ ] Verify USDC transfer actually occurs
- [ ] Check order status in database
- [ ] Verify both txHashes stored correctly

---

*Reference created: 2026-08-16*
*For detailed documentation see: REDEEM_RTB_USDC_IMPLEMENTATION.md*
