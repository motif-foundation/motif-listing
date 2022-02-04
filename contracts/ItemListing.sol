pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC721, IERC165 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import { IItemExchange, Decimal } from "./interfaces/IItemExchange.sol";
import { IItem } from "./interfaces/IItem.sol";
import { IItemListing } from "./interfaces/IItemListing.sol"; 

interface IWMOTIF {
    function deposit() external payable;
    function withdraw(uint wad) external; 
    function transfer(address to, uint256 value) external returns (bool);
}

interface IItemExtended is IItem {
    function itemExchangeContract() external returns(address);
}
 
contract ItemListing is IItemListing, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter; 
    uint256 public timeBuffer; 
    uint8 public minBidIncrementPercentage; 
    address public motif; 
    address public wmotifAddress; 
    mapping(uint256 => IItemListing.Listing) public listings; 
    
    bytes4 constant interfaceId = 0x80ac58cd;  

    Counters.Counter private _listingIdTracker;

    modifier listingExists(uint256 listingId) {
        require(_exists(listingId), "Listing doesn't exist");
        _;
    }
 
    constructor(address _motif, address _wmotif) public {
        require(
            IERC165(_motif).supportsInterface(interfaceId),
            "Doesn't support NFT interface"
        );
        motif = _motif;
        wmotifAddress = _wmotif;
        timeBuffer = 20 * 60;  
        minBidIncrementPercentage = 5;  
    }
     
    function createListing(
        uint256 tokenId,
        address tokenContract,
        uint256 startsAt,
        uint256 duration,
        uint256 listPrice,
        uint8 listType,
        address payable intermediary,
        uint8 intermediaryFeePercentage,
        address listCurrency
    ) public override nonReentrant returns (uint256) {
        require(
            IERC165(tokenContract).supportsInterface(interfaceId),
            "tokenContract does not support ERC721 interface"
        );
        require(intermediaryFeePercentage < 100, "intermediaryFeePercentage must be less than 100");
        address tokenOwner = IERC721(tokenContract).ownerOf(tokenId);
        require(msg.sender == IERC721(tokenContract).getApproved(tokenId) || msg.sender == tokenOwner, "Caller must be approved or owner for token id");
        uint256 listingId = _listingIdTracker.current();

        listings[listingId] = Listing({
            tokenId: tokenId,
            tokenContract: tokenContract,
            approved: false,
            amount: 0,
            startsAt: startsAt,
            duration: duration,
            firstBidTime: 0,
            listPrice: listPrice,
            listType: listType, //1 - bid, 2 - drop bid, 3 - fixed
            intermediaryFeePercentage: intermediaryFeePercentage,
            tokenOwner: tokenOwner,
            bidder: address(0),
            intermediary: intermediary,
            listCurrency: listCurrency
        });

        IERC721(tokenContract).transferFrom(tokenOwner, address(this), tokenId);

        _listingIdTracker.increment();

        emit ListingCreated(listingId, tokenId, tokenContract, startsAt, duration, listPrice, listType, tokenOwner, intermediary, intermediaryFeePercentage, listCurrency);


        if(listings[listingId].intermediary == address(0) || intermediary == tokenOwner) {
            _approveListing(listingId, true);
        }

        return listingId;
    }

    function setListingApproval(uint256 listingId, bool approved) external override listingExists(listingId) {
        require(msg.sender == listings[listingId].intermediary, "Must be listing intermediary");
        require(listings[listingId].firstBidTime == 0, "Listing has already started");
        _approveListing(listingId, approved);
    }

   function setListingDropApproval(uint256 listingId, bool approved, uint256 startsAt) external override listingExists(listingId) {
        require(
             (listings[listingId].listType == 2),
                "Must be drop listType"
        );
        require(msg.sender == listings[listingId].intermediary, "Must be list intermediary");
        require(listings[listingId].firstBidTime == 0, "List has already started");
        _approveListingDrop(listingId, approved, startsAt);
    }

    function setListingListPrice(uint256 listingId, uint256 listPrice) external override listingExists(listingId) {
        require(msg.sender == listings[listingId].intermediary || msg.sender == listings[listingId].tokenOwner, "Must be listing intermediary or token owner");
        require(listings[listingId].firstBidTime == 0, "Listing has already started");

        listings[listingId].listPrice = listPrice;

        emit ListingListPriceUpdated(listingId, listings[listingId].tokenId, listings[listingId].tokenContract, listPrice);
    }

    function createBid(uint256 listingId, uint256 amount)
    external
    override
    payable
    listingExists(listingId)
    nonReentrant
    {
        address payable lastBidder = listings[listingId].bidder;
        require(listings[listingId].approved, "Listing must be approved by intermediary");
			
		  require(
             (listings[listingId].listType == 1 || listings[listingId].listType == 2),
                "Must be bidding or drop listType"
        );
        require(
            block.timestamp >= listings[listingId].startsAt,
            "List is not active"
        ); 
        require(
            listings[listingId].firstBidTime == 0 ||
            block.timestamp <
            listings[listingId].firstBidTime.add(listings[listingId].duration),
            "Listing expired"
        ); 
        require(
            amount >= listings[listingId].listPrice,
                "Must send at least listPrice"
        );
        require(
            amount >= listings[listingId].amount.add(
                listings[listingId].amount.mul(minBidIncrementPercentage).div(100)
            ),
            "Must send more than last bid by minBidIncrementPercentage amount"
        );  
	     require(
	          IItemExchange(IItemExtended(motif).itemExchangeContract()).isValidBid(
	              listings[listingId].tokenId,
	              amount
	          ),
	          "Bid invalid for share splitting"
	      );
 
        if(listings[listingId].firstBidTime == 0) {
            listings[listingId].firstBidTime = block.timestamp;
        } else if(lastBidder != address(0)) {
            _handleOutgoingBid(lastBidder, listings[listingId].amount, listings[listingId].listCurrency);
        }

        _handleIncomingBid(amount, listings[listingId].listCurrency);

        listings[listingId].amount = amount;
        listings[listingId].bidder = msg.sender;


        bool extended = false; 
        if (
            listings[listingId].firstBidTime.add(listings[listingId].duration).sub(
                block.timestamp
            ) < timeBuffer
        ) { 
            uint256 oldDuration = listings[listingId].duration;
            listings[listingId].duration =
                oldDuration.add(timeBuffer.sub(listings[listingId].firstBidTime.add(oldDuration).sub(block.timestamp)));
            extended = true;
        }

        emit ListingBid(
            listingId,
            listings[listingId].tokenId,
            listings[listingId].tokenContract,
            msg.sender,
            amount,
            lastBidder == address(0), 
            extended
        );

        if (extended) {
            emit ListingDurationExtended(
                listingId,
                listings[listingId].tokenId,
                listings[listingId].tokenContract,
                listings[listingId].duration
            );
        }
    }
 
    function endListing(uint256 listingId) external override listingExists(listingId) nonReentrant {
        require(
            (listings[listingId].listType == 1 || listings[listingId].listType == 2),
                "Must be bidding or drop listType"
        );
        require(
            uint256(listings[listingId].firstBidTime) != 0,
            "Listing hasn't begun"
        );
        require(
            block.timestamp >= listings[listingId].startsAt,
            "List is not active"
        );
        require(
            block.timestamp >=
            listings[listingId].firstBidTime.add(listings[listingId].duration),
            "Listing hasn't completed"
        );

         address currency = listings[listingId].listCurrency == address(0) ? wmotifAddress : listings[listingId].listCurrency;
         uint256 intermediaryFee = 0;

         uint256 tokenOwnerProfit = listings[listingId].amount;

         (bool success, uint256 remainingProfit) = _handleMotifListingSettlement(listingId);
         tokenOwnerProfit = remainingProfit;
         if(success != true) {
             _handleOutgoingBid(listings[listingId].bidder, listings[listingId].amount, listings[listingId].listCurrency);
             _cancelListing(listingId);
             return;
         } 

        if(listings[listingId].intermediary != address(0)) {
            intermediaryFee = tokenOwnerProfit.mul(listings[listingId].intermediaryFeePercentage).div(100);
            tokenOwnerProfit = tokenOwnerProfit.sub(intermediaryFee);
            _handleOutgoingBid(listings[listingId].intermediary, intermediaryFee, listings[listingId].listCurrency);
        }
        _handleOutgoingBid(listings[listingId].tokenOwner, tokenOwnerProfit, listings[listingId].listCurrency);

        emit ListingEnded(
            listingId,
            listings[listingId].tokenId,
            listings[listingId].tokenContract,
            listings[listingId].tokenOwner,
            listings[listingId].intermediary,
            listings[listingId].bidder,
            tokenOwnerProfit,
            intermediaryFee,
            currency
        );
        delete listings[listingId];
    }

    
    function cancelListing(uint256 listingId) external override nonReentrant listingExists(listingId) {
        require(
            listings[listingId].tokenOwner == msg.sender || listings[listingId].intermediary == msg.sender,
            "Can only be called by listing creator or intermediary"
        );
        require(
            uint256(listings[listingId].firstBidTime) == 0,
            "Can't cancel an listing once it's begun"
        );
        _cancelListing(listingId);
    }   

	 function endFixedPriceListing(uint256 listingId, uint256 amount)
	    external
	    override
	    payable 
	    nonReentrant
	    { 
		     _handleEndFixedPriceListing(listingId, amount); 
	    }

	   function endFixedPriceListings(uint256[] calldata listingIds, uint256[] calldata amounts)
	    external
	    override
	    payable 
	    nonReentrant
	    { 
	    	require(listingIds.length > 0, "Listing ids must not be empty");
	    	require(listingIds.length <= 50, "Length of listing ids must be equal to or less than 50");
	    	require(listingIds.length == amounts.length, "Length of listing ids and amounts must match");

	    	for(uint i=0; i<listingIds.length; i++){
         	_handleEndFixedPriceListing(listingIds[i], amounts[i]); 
     		} 
		    
	    } 
 
      function _handleEndFixedPriceListing(uint256 listingId, uint256 amount) internal { 
   	 	require(_exists(listingId), "Listing doesn't exist");
  			require(listings[listingId].approved, "Listing must be approved by intermediary"); 
 			require(
            listings[listingId].listType == 3,
                "Must be fixed price listType"
        );
        require(
            block.timestamp >= listings[listingId].startsAt,
            "List is not active"
        ); 
        require(
            listings[listingId].firstBidTime == 0 ||
            block.timestamp <
            listings[listingId].firstBidTime.add(listings[listingId].duration),
            "Listing expired"
        ); 
        require(
            amount == listings[listingId].listPrice,
                "Must send listPrice"
        ); 
	     require(
	          IItemExchange(IItemExtended(motif).itemExchangeContract()).isValidBid(
	              listings[listingId].tokenId,
	              amount
	          ),
	          "Bid invalid for share splitting"
	      );  

        listings[listingId].firstBidTime = block.timestamp;
      
        _handleIncomingBid(amount, listings[listingId].listCurrency);

        listings[listingId].amount = amount;
        listings[listingId].bidder = msg.sender;
 
        emit ListingBid(
            listingId,
            listings[listingId].tokenId,
            listings[listingId].tokenContract,
            msg.sender,
            amount,
            true, 
            false
        ); 

 		  address currency = listings[listingId].listCurrency == address(0) ? wmotifAddress : listings[listingId].listCurrency;
        uint256 intermediaryFee = 0;

        uint256 tokenOwnerProfit = listings[listingId].amount; 
      
         (bool success, uint256 remainingProfit) = _handleMotifListingSettlement(listingId);
         tokenOwnerProfit = remainingProfit;
         if(success != true) {
             _handleOutgoingBid(listings[listingId].bidder, listings[listingId].amount, listings[listingId].listCurrency);
             _cancelListing(listingId);
             return;
         } 

        if(listings[listingId].intermediary != address(0)) {
            intermediaryFee = tokenOwnerProfit.mul(listings[listingId].intermediaryFeePercentage).div(100);
            tokenOwnerProfit = tokenOwnerProfit.sub(intermediaryFee);
            _handleOutgoingBid(listings[listingId].intermediary, intermediaryFee, listings[listingId].listCurrency);
        }
        _handleOutgoingBid(listings[listingId].tokenOwner, tokenOwnerProfit, listings[listingId].listCurrency);

        emit ListingEnded(
            listingId,
            listings[listingId].tokenId,
            listings[listingId].tokenContract,
            listings[listingId].tokenOwner,
            listings[listingId].intermediary,
            listings[listingId].bidder,
            tokenOwnerProfit,
            intermediaryFee,
            currency
        );
        delete listings[listingId];  

   }

    function _handleIncomingBid(uint256 amount, address currency) internal { 
        if(currency == address(0)) {
            require(msg.value == amount, "Sent MOTIF Value does not match specified bid amount");
            IWMOTIF(wmotifAddress).deposit{value: amount}();
        } else { 
            IERC20 token = IERC20(currency);
            uint256 beforeBalance = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), amount);
            uint256 afterBalance = token.balanceOf(address(this));
            require(beforeBalance.add(amount) == afterBalance, "Token transfer call did not transfer expected amount");
        }
    } 

    function _handleOutgoingBid(address to, uint256 amount, address currency) internal { 
        if(currency == address(0)) {
            IWMOTIF(wmotifAddress).withdraw(amount);
 
            if(!_safeTransferMOTIF(to, amount)) {
                IWMOTIF(wmotifAddress).deposit{value: amount}();
                IERC20(wmotifAddress).safeTransfer(to, amount);
            }
        } else {
            IERC20(currency).safeTransfer(to, amount);
        }
    }

    function _safeTransferMOTIF(address to, uint256 value) internal returns (bool) {
        (bool success, ) = to.call{value: value}(new bytes(0));
        return success;
    }

    function _cancelListing(uint256 listingId) internal {
        address tokenOwner = listings[listingId].tokenOwner;
        IERC721(listings[listingId].tokenContract).safeTransferFrom(address(this), tokenOwner, listings[listingId].tokenId);

        emit ListingCanceled(listingId, listings[listingId].tokenId, listings[listingId].tokenContract, tokenOwner);
        delete listings[listingId];
    }

    function _approveListing(uint256 listingId, bool approved) internal {
        listings[listingId].approved = approved;
        emit ListingApprovalUpdated(listingId, listings[listingId].tokenId, listings[listingId].tokenContract, approved);
    }

   function _approveListingDrop(uint256 listingId, bool approved, uint256 startsAt) internal { 
        listings[listingId].approved = approved;
        listings[listingId].startsAt = startsAt;
        emit ListingDropApprovalUpdated(listingId, listings[listingId].tokenId, listings[listingId].tokenContract, approved, startsAt);
    }

    function _exists(uint256 listingId) internal view returns(bool) {
        return listings[listingId].tokenOwner != address(0);
    }

    function _handleMotifListingSettlement(uint256 listingId) internal returns (bool, uint256) {
        address currency = listings[listingId].listCurrency == address(0) ? wmotifAddress : listings[listingId].listCurrency;

        IItemExchange.Bid memory bid = IItemExchange.Bid({
            amount: listings[listingId].amount,
            currency: currency,
            bidder: address(this),
            recipient: listings[listingId].bidder,
            sellOnShare: Decimal.D256(0)
        });

        IERC20(currency).approve(IItemExtended(motif).itemExchangeContract(), bid.amount);
        IItem(motif).setBid(listings[listingId].tokenId, bid);
        uint256 beforeBalance = IERC20(currency).balanceOf(address(this));
        try IItem(motif).acceptBid(listings[listingId].tokenId, bid) {} catch { 
            IItemExtended(motif).removeBid(listings[listingId].tokenId);
            return (false, 0);
        }
        uint256 afterBalance = IERC20(currency).balanceOf(address(this));
 
        return (true, afterBalance.sub(beforeBalance));
    } 
    receive() external payable {}
    fallback() external payable {}
}