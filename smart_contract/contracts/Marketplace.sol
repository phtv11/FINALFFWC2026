// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Marketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum ListingStatus {
        ACTIVE,
        SOLD,
        CANCELLED
    }

    struct Listing {
        uint256 listingId;
        uint256 tokenId;
        address seller;
        address buyer;
        uint256 price;
        ListingStatus status;
        uint256 createdAt;
        uint256 soldAt;
    }

    IERC721 public immutable rtbContract;
    IERC20 public immutable usdc;
    address public immutable treasury;

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => bool) public isTokenListed;

    event Listed(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller);
    event Sold(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed buyer,
        address seller,
        uint256 sellerAmount,
        uint256 treasuryAmount,
        uint256 totalPrice
    );

    constructor(address _rtbContract, address _usdc, address _treasury) {
        require(_rtbContract != address(0), "RTB contract is required");
        require(_usdc != address(0), "USDC contract is required");
        require(_treasury != address(0), "Treasury is required");

        rtbContract = IERC721(_rtbContract);
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    function listRTB(uint256 tokenId, uint256 price) external nonReentrant {
        require(price > 0, "Price must be > 0");
        require(!isTokenListed[tokenId], "Token is already listed");
        require(rtbContract.ownerOf(tokenId) == msg.sender, "Not token owner");

        uint256 listingId = nextListingId++;
        listings[listingId] = Listing({
            listingId: listingId,
            tokenId: tokenId,
            seller: msg.sender,
            buyer: address(0),
            price: price,
            status: ListingStatus.ACTIVE,
            createdAt: block.timestamp,
            soldAt: 0
        });
        isTokenListed[tokenId] = true;

        rtbContract.transferFrom(msg.sender, address(this), tokenId);

        emit Listed(listingId, tokenId, msg.sender, price);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.createdAt != 0, "Listing not found");
        require(listing.status == ListingStatus.ACTIVE, "Listing is not active");
        require(listing.seller == msg.sender, "Only seller can cancel");

        listing.status = ListingStatus.CANCELLED;
        isTokenListed[listing.tokenId] = false;

        rtbContract.transferFrom(address(this), msg.sender, listing.tokenId);

        emit Cancelled(listingId, listing.tokenId, msg.sender);
    }

    function buyRTB(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.createdAt != 0, "Listing not found");
        require(listing.status == ListingStatus.ACTIVE, "Listing is not active");
        require(msg.sender != listing.seller, "Seller cannot buy own listing");
        require(listing.price > 0, "Price must be > 0");

        uint256 fee = (listing.price * 15) / 100;
        uint256 sellerAmount = listing.price - fee;

        usdc.safeTransferFrom(msg.sender, listing.seller, sellerAmount);
        usdc.safeTransferFrom(msg.sender, treasury, fee);

        listing.buyer = msg.sender;
        listing.status = ListingStatus.SOLD;
        listing.soldAt = block.timestamp;
        isTokenListed[listing.tokenId] = false;

        rtbContract.transferFrom(address(this), msg.sender, listing.tokenId);

        emit Sold(listingId, listing.tokenId, msg.sender, listing.seller, sellerAmount, fee, listing.price);
    }
}
