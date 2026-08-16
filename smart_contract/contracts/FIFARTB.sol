// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @dev Interface tối thiểu của FIFARTT để FIFARTB gọi mint khi redeem.
interface IFIFARTT {
    function mintRTT(address to, string calldata matchId, uint256 fromRTBTokenId) external returns (uint256);
}

/**
 * @title FIFARTB
 * @notice Collection Right-to-Buy (RTB) — quyền ưu tiên mua, có thể giao dịch tự do
 *         trên thị trường thứ cấp trong khi còn ở trạng thái RTB.
 *
 * LƯU Ý QUAN TRỌNG: Đây là hợp đồng phục vụ mục đích học thuật/demo, KHÔNG phải bản
 * sao chính xác hệ thống thật của FIFA (mã nguồn thật không công khai).
 *
 * Vòng đời:
 *   1. NONE -> mintRTB() -> RTB (token thuộc collection này)
 *   2. RTB  -> redeem()  -> burn token RTB này + mint token mới bên collection FIFARTT
 *
 * Vì mỗi token RTB chỉ có 1 trạng thái duy nhất trong suốt vòng đời của nó (nó bị burn
 * ngay khi redeem), TokenInfo không cần field `status` như bản gộp trước đây.
 *
 * Trình tự deploy:
 *   1. Deploy FIFARTB trước -> có địa chỉ rtbAddress
 *   2. Deploy FIFARTT(admin, rtbAddress) -> RTT tự cấp MINTER_ROLE cho FIFARTB
 *   3. Gọi FIFARTB.setRTTContract(rttAddress) để RTB biết nơi gọi mintRTT()
 */
contract FIFARTB is ERC721, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct TokenInfo {
        string matchId; // Ví dụ: "WC26-FINAL"
        uint256 mintedAt;
    }

    mapping(uint256 => TokenInfo) public tokenInfo;
    mapping(string => uint256) public maxSupply;
    mapping(string => uint256) public minted;
    uint256 public nextTokenId = 1;

    /// @notice Địa chỉ contract FIFARTT — nơi nhận lệnh mint khi holder redeem RTB -> RTT.
    IFIFARTT public rttContract;

    /// @notice Marketplace contract address that is approved to transfer RTBs
    address public approvedMarketplace;

    /// @dev Cờ tạm để cho phép _update() phân biệt giữa transferRTB() (hợp lệ) và
    ///      transferFrom()/safeTransferFrom() mặc định của ERC721 (bị chặn).
    bool private _inControlledTransfer;

    event RTBMinted(uint256 indexed tokenId, address indexed to, string matchId);
    event RTBTransferred(uint256 indexed tokenId, address indexed from, address indexed to);
    event RedeemedToRTT(uint256 indexed rtbTokenId, address indexed holder, uint256 indexed rttTokenId);
    event RTTContractSet(address indexed rttContract);
    event MaxSupplySet(string indexed matchId, uint256 maxSupply);
    event MarketplaceApproved(address indexed marketplace);

    constructor() ERC721("FIFA Right-to-Buy Demo", "RTB-DEMO") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    /// @notice Admin approves a Marketplace contract to transfer RTBs
    function setApprovedMarketplace(address marketplaceAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(marketplaceAddress != address(0), "Dia chi marketplace khong hop le");
        approvedMarketplace = marketplaceAddress;
        emit MarketplaceApproved(marketplaceAddress);
    }

    /// @notice Admin gắn địa chỉ contract RTT sau khi deploy nó (bước 3 trong trình tự deploy ở trên).
    function setRTTContract(address rttAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(rttAddress != address(0), "Dia chi khong hop le");
        rttContract = IFIFARTT(rttAddress);
        emit RTTContractSet(rttAddress);
    }

    /// @notice Admin đặt giới hạn RTB tối đa cho một trận.
    function setMaxSupply(string calldata matchId, uint256 supply) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(matchId).length > 0, "MatchId khong hop le");
        require(supply > 0, "Max supply phai lon hon 0");
        require(supply >= minted[matchId], "Max supply nho hon so da mint");
        maxSupply[matchId] = supply;
        emit MaxSupplySet(matchId, supply);
    }

    /// @notice Backend (operator) mint RTB vào ví của người dùng sau khi họ thanh toán qua kênh Web2.
    function mintRTB(address to, string calldata matchId) external onlyRole(OPERATOR_ROLE) returns (uint256) {
        if (maxSupply[matchId] == 0) {
            maxSupply[matchId] = type(uint256).max;
        }
        require(minted[matchId] < maxSupply[matchId], "Da het luong RTB cho tran");

        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        tokenInfo[tokenId] = TokenInfo({matchId: matchId, mintedAt: block.timestamp});
        minted[matchId] += 1;
        emit RTBMinted(tokenId, to, matchId);
        return tokenId;
    }

    /// @notice Người giữ RTB chuyển nhượng trên thị trường thứ cấp.
    function transferRTB(address to, uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Khong phai chu so huu");
        _inControlledTransfer = true;
        _transfer(msg.sender, to, tokenId);
        _inControlledTransfer = false;
        emit RTBTransferred(tokenId, msg.sender, to);
    }

    /// @notice Chủ sở hữu RTB "sử dụng" quyền của mình: burn token RTB này và mint một token
    ///         mới bên collection FIFARTT cho cùng holder.
    function redeem(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Khong phai chu so huu");
        require(address(rttContract) != address(0), "Chua gan RTT contract");

        string memory matchId = tokenInfo[tokenId].matchId;
        address holder = msg.sender;

        _burn(tokenId);
        delete tokenInfo[tokenId];

        uint256 rttTokenId = rttContract.mintRTT(holder, matchId, tokenId);
        emit RedeemedToRTT(tokenId, holder, rttTokenId);
    }

    /// @dev Chặn mọi chuyển nhượng ERC721 mặc định (transferFrom/safeTransferFrom) — bắt buộc phải
    ///      đi qua transferRTB() để giao dịch, TRỪ KHI từ Marketplace contract được phê duyệt.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Allow transfer if:
        // 1. It's a controlled transfer via transferRTB()
        // 2. It's from the approved marketplace contract
        // 3. It's minting (from == address(0)) or burning (to == address(0))
        if (from != address(0) && to != address(0) && !_inControlledTransfer && msg.sender != approvedMarketplace) {
            revert("Dung transferRTB() thay vi transfer mac dinh");
        }
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
