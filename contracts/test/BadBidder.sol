// SPDX-License-Identifier: GPL-3.0

// FOR TEST PURPOSES ONLY. NOT PRODUCTION SAFE
pragma solidity 0.6.8;
import {IItemListing} from "../interfaces/IItemListing.sol";

// This contract is meant to mimic a bidding contract that does not implement on IERC721 Received,
// and thus should cause a revert when an listing is finalized with this as the winning bidder.
contract BadBidder {
    address listing;
    address motif;

    constructor(address _listing, address _motif) public {
        listing = _listing;
        motif = _motif;
    }

    function placeBid(uint256 listingId, uint256 amount) external payable {
        IItemListing(listing).createBid{value: amount}(listingId, amount);
    }

    receive() external payable {}
    fallback() external payable {}
}