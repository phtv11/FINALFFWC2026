// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FIFARTBMarketplace
 * @notice Marketplace for FIFARTB tokens with USDC payment
 *
 * Seller lists RTB → Buyer calls buy() → Contract:
 * 1. Transfer USDC: 85% to seller, 15% to treasury
 * 2. Transfer RTB from seller to buyer
 * (Both atomic in one transaction)
 *
 * Requirements:
 * - Seller must approve Marketplace contract as operator for RTB
 * - Buyer must approve USDC allowance for Marketplace contract
 * - Listing must exist and be active
 */
contract FIFARTBMarketplace is AccessControl, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // ===========================
    // Structs
    // ===========================

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 price;
        bool active;
        uint256 createdAt;
    }

    // ===========================
    // Constants & Variables
    // ===========================

    IERC721 public rtbContract;
    IERC20 public usdcContract;
    address public treasury;

    /// @notice Fee percentage (1000 = 10%, 150 = 1.5%, 1500 = 15%)
    uint256 public feePercentage = 1500; // 15%

    /// @notice Mapping tokenId -> Listing
    mapping(uint256 => Listing) public listings;

    // ===========================
    // Events
    // ===========================

    event ListingCreated(
        address indexed seller,
        uint256 indexed tokenId,
        uint256 price,
        uint256 timestamp
    );

    event ListingCancelled(
        address indexed seller,
        uint256 indexed tokenId,
        uint256 timestamp
    );

    event RTBSold(
        address indexed buyer,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 price,
        uint256 sellerAmount,
        uint256 feeAmount,
        uint256 timestamp
    );

    event TreasuryUpdated(address indexed newTreasury);
    event FeePercentageUpdated(uint256 newPercentage);

    // ===========================
    // Modifiers
    // ===========================

    modifier listingExists(uint256 tokenId) {
        require(listings[tokenId].active, "Listing does not exist or is inactive");
        _;
    }

    modifier onlyListingSeller(uint256 tokenId) {
        require(
            listings[tokenId].seller == msg.sender,
            "Only seller can call this"
        );
        _;
    }

    // ===========================
    // Constructor
    // ===========================

    /// @param _rtbAddress Address of FIFARTB contract
    /// @param _usdcAddress Address of USDC contract
    /// @param _treasury Address to receive marketplace fees
    constructor(address _rtbAddress, address _usdcAddress, address _treasury) {
        require(_rtbAddress != address(0), "Invalid RTB address");
        require(_usdcAddress != address(0), "Invalid USDC address");
        require(_treasury != address(0), "Invalid treasury address");

        rtbContract = IERC721(_rtbAddress);
        usdcContract = IERC20(_usdcAddress);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    // ===========================
    // Admin Functions
    // ===========================

    /// @notice Update treasury address
    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Update fee percentage (e.g., 1500 = 15%)
    function setFeePercentage(uint256 _percentage) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_percentage <= 5000, "Fee too high (max 50%)");
        feePercentage = _percentage;
        emit FeePercentageUpdated(_percentage);
    }

    // ===========================
    // Seller Functions
    // ===========================

    /// @notice Create a new listing
    /// @param _tokenId RTB token ID to list
    /// @param _price USDC price (in smallest unit, e.g., 50 * 10^6 for 50 USDC)
    function createListing(uint256 _tokenId, uint256 _price)
        external
        nonReentrant
    {
        require(_price > 0, "Price must be greater than 0");
        require(!listings[_tokenId].active, "Token already listed");

        // Verify seller owns the token
        require(
            rtbContract.ownerOf(_tokenId) == msg.sender,
            "You do not own this token"
        );

        listings[_tokenId] = Listing({
            seller: msg.sender,
            tokenId: _tokenId,
            price: _price,
            active: true,
            createdAt: block.timestamp
        });

        emit ListingCreated(msg.sender, _tokenId, _price, block.timestamp);
    }

    /// @notice Cancel a listing
    /// @param _tokenId RTB token ID to cancel
    function cancelListing(uint256 _tokenId)
        external
        nonReentrant
        listingExists(_tokenId)
        onlyListingSeller(_tokenId)
    {
        listings[_tokenId].active = false;
        emit ListingCancelled(msg.sender, _tokenId, block.timestamp);
    }

    // ===========================
    // Buyer Functions
    // ===========================

    /// @notice Buy an RTB token
    /// @dev Buyer must have approved USDC allowance beforehand
    /// @param _tokenId RTB token ID to buy
    function buy(uint256 _tokenId)
        external
        nonReentrant
        listingExists(_tokenId)
    {
        Listing memory listing = listings[_tokenId];
        address buyer = msg.sender;
        address seller = listing.seller;
        uint256 price = listing.price;

        // Validations
        require(buyer != seller, "Cannot buy your own listing");
        require(price > 0, "Invalid price");
        require(
            rtbContract.ownerOf(_tokenId) == seller,
            "Seller no longer owns this token"
        );

        // Calculate fee
        uint256 feeAmount = (price * feePercentage) / 10000;
        uint256 sellerAmount = price - feeAmount;

        // Verify buyer has sufficient USDC balance and allowance
        require(
            usdcContract.balanceOf(buyer) >= price,
            "Insufficient USDC balance"
        );
        require(
            usdcContract.allowance(buyer, address(this)) >= price,
            "Insufficient USDC allowance"
        );

        // Deactivate listing before transfers (prevent reentrancy)
        listings[_tokenId].active = false;

        // Transfer USDC: buyer -> seller (85%)
        require(
            usdcContract.transferFrom(buyer, seller, sellerAmount),
            "USDC transfer to seller failed"
        );

        // Transfer USDC: buyer -> treasury (15%)
        require(
            usdcContract.transferFrom(buyer, treasury, feeAmount),
            "USDC transfer to treasury failed"
        );

        // Transfer RTB: seller -> buyer
        rtbContract.transferFrom(seller, buyer, _tokenId);

        // Emit event
        emit RTBSold(buyer, seller, _tokenId, price, sellerAmount, feeAmount, block.timestamp);
    }

    // ===========================
    // View Functions
    // ===========================

    /// @notice Get listing details
    /// @param _tokenId RTB token ID
    function getListing(uint256 _tokenId)
        external
        view
        returns (Listing memory)
    {
        return listings[_tokenId];
    }

    /// @notice Check if listing is active
    /// @param _tokenId RTB token ID
    function isListingActive(uint256 _tokenId) external view returns (bool) {
        return listings[_tokenId].active;
    }

    /// @notice Calculate fee for a price
    /// @param _price USDC price
    function calculateFee(uint256 _price) external view returns (uint256) {
        return (_price * feePercentage) / 10000;
    }

    /// @notice Calculate seller amount for a price
    /// @param _price USDC price
    function calculateSellerAmount(uint256 _price)
        external
        view
        returns (uint256)
    {
        return _price - ((_price * feePercentage) / 10000);
    }

    // ===========================
    // Required Override
    // ===========================

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
