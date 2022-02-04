pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

interface ISpaceListing {
    struct Listing { 
    uint256 tokenId; 
        address tokenContract; 
        bool approved; 
        uint256 amount; 
        uint256 startsAt;
        uint256 duration; 
        uint256 firstBidTime; 
        uint256 listPrice; 
        uint8 listType;
        uint8 intermediaryFeePercentage; 
        address tokenOwner; 
        address payable bidder; 
        address payable intermediary; 
        address listCurrency;
    }

    event ListingCreated(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed tokenContract,
        uint256 startsAt,
        uint256 duration,
        uint256 listPrice,
        uint8 listType,
        address tokenOwner,
        address intermediary,
        uint8 intermediaryFeePercentage,
        address listCurrency
    );

    event ListingApprovalUpdated(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed tokenContract,
        bool approved
    );

 	event ListingDropApprovalUpdated(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed tokenContract,
        bool approved,
        uint256 startsAt
    );

    event ListingListPriceUpdated(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed tokenContract,
        uint256 listPrice
    );

    event ListingBid(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed tokenContract,
        address sender,
        uint256 value,
        bool firstBid,
        bool extended
    );

    event ListingDurationExtended(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed tokenContract,
        uint256 duration
    );

    event ListingEnded(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed tokenContract,
        address tokenOwner,
        address intermediary,
        address winner,
        uint256 amount,
        uint256 intermediaryFee,
        address listCurrency
    );

    event ListingCanceled(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed tokenContract,
        address tokenOwner
    );

    function createListing(
        uint256 tokenId,
        address tokenContract,
        uint256 startsAt,
        uint256 duration,
        uint256 listPrice,
        uint8 listType,
        address payable intermediary,
        uint8 intermediaryFeePercentages,
        address listCurrency
    ) external returns (uint256);

    function setListingApproval(uint256 listingId, bool approved) external;

    function setListingDropApproval(uint256 listingId, bool approved, uint256 startsAt) external;

    function setListingListPrice(uint256 listingId, uint256 listPrice) external;

    function createBid(uint256 listingId, uint256 amount) external payable;

    function endFixedPriceListing(uint256 listingId, uint256 amount) external payable; 

    function endListing(uint256 listingId) external;

    function cancelListing(uint256 listingId) external;
}