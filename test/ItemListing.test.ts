import chai, { expect } from "chai";
import asPromised from "chai-as-promised";
// @ts-ignore
import { ethers } from "hardhat";
import { ItemExchange, Item } from "@motif-foundation/asset/dist/typechain";
import { ItemListing, BadBidder, TestERC721, BadERC721 } from "../typechain";
import { formatUnits } from "ethers/lib/utils";
import { BigNumber, Contract, Signer } from "ethers";
import {
  approveListing,
  deployBidder,
  deployOtherNFTs,
  deployWMOTIF,
  deployMotifProtocol,
  mint,
  ONE_MOTIF,
  revert,
  TWO_MOTIF,
} from "./utils";

chai.use(asPromised);


const ONE_DAY = 24 * 60 * 60;

describe("ItemListing", () => {
  let itemExchange: ItemExchange;
  let item: Item;
  let wmotif: Contract;
  let badERC721: BadERC721;
  let testERC721: TestERC721;

  beforeEach(async () => {
    await ethers.provider.send("hardhat_reset", []);
    const contracts = await deployMotifProtocol();
    const nfts = await deployOtherNFTs();
    itemExchange = contracts.itemExchange;
    item = contracts.item;
    wmotif = await deployWMOTIF();
    badERC721 = nfts.bad;
    testERC721 = nfts.test;
  });

  async function deploy(): Promise<ItemListing> {
    const ItemListing = await ethers.getContractFactory("ItemListing");
    const itemListing = await ItemListing.deploy(item.address, wmotif.address);

    return itemListing as ItemListing;
  }

  async function createListing(
    itemListing: ItemListing,
    intermediary: string,
    currency = "0x0000000000000000000000000000000000000000"
  ) {
    const tokenId = 0;
    const duration = 60 * 60 * 24;
    const listPrice = BigNumber.from(10).pow(18).div(2);

    await itemListing.createListing(
      tokenId,
      item.address,
      Date.now(),
      duration,
      listPrice,
         1,
      intermediary,
      5,
      currency
    );
  }











  describe("#constructor", () => {
    it("should be able to deploy", async () => {
      const ItemListing = await ethers.getContractFactory("ItemListing");
      const itemListing = await ItemListing.deploy(
        item.address,
        wmotif.address
      );

      expect(await itemListing.motif()).to.eq(
        item.address,
        "incorrect motif address"
      );
      expect(formatUnits(await itemListing.timeBuffer(), 0)).to.eq(
        "1200",
        "time buffer should equal 1200"
      );
      expect(await itemListing.minBidIncrementPercentage()).to.eq(
        5,
        "minBidIncrementPercentage should equal 5%"
      );
    });

    it("should not allow a configuration address that is not the Motif Item Protocol", async () => {
      const ItemListing = await ethers.getContractFactory("ItemListing");
      await expect(
        ItemListing.deploy(itemExchange.address, wmotif.address)
      ).eventually.rejectedWith("Transaction reverted without a reason");
    });
  });

  describe("#createListing", () => {
    let itemListing: ItemListing;
    beforeEach(async () => {
      itemListing = await deploy();
      await mint(item);
      await approveListing(item, itemListing);
    });

    it("should revert if the token contract does not support the ERC721 interface", async () => {
      const duration = 60 * 60 * 24;
      const listPrice = BigNumber.from(10).pow(18).div(2);
      const [_, intermediary] = await ethers.getSigners();

      

      await expect(
        itemListing.createListing(
          0,
          badERC721.address,
            Date.now(),
          duration,
          listPrice,
               1,
          intermediary.address,
          5,
          "0x0000000000000000000000000000000000000000"
        )
      ).eventually.rejectedWith(
        `tokenContract does not support ERC721 interface`
      );
    });

    it("should revert if the caller is not approved", async () => {
      const duration = 60 * 60 * 24;
      const listPrice = BigNumber.from(10).pow(18).div(2);
      const [_, intermediary, __, ___, unapproved] = await ethers.getSigners();
      await expect(
        itemListing
          .connect(unapproved)
          .createListing(
            0,
            item.address,
                Date.now(),
            duration,
            listPrice,
               1,
            intermediary.address,
            5,
            "0x0000000000000000000000000000000000000000"
          )
      ).eventually.rejectedWith(
        `Caller must be approved or owner for token id`
      );
    });




    it("should revert if the token ID does not exist", async () => {
      const tokenId = 999;
      const duration = 60 * 60 * 24;
      const listPrice = BigNumber.from(10).pow(18).div(2);
      const owner = await item.ownerOf(0);
      const [admin, intermediary] = await ethers.getSigners();

      await expect(
        itemListing
          .connect(admin)
          .createListing(
            tokenId,
            item.address,
                Date.now(),
            duration,
            listPrice,
               1,
            intermediary.address,
            5,
            "0x0000000000000000000000000000000000000000"
          )
      ).eventually.rejectedWith(
        `ERC721: owner query for nonexistent token`
      );
    });

    it("should revert if the intermediary fee percentage is >= 100", async () => {
      const duration = 60 * 60 * 24;
      const listPrice = BigNumber.from(10).pow(18).div(2);
      const owner = await item.ownerOf(0);
      const [_, intermediary] = await ethers.getSigners();

      await expect(
        itemListing.createListing(
 0,
            item.address,
                Date.now(),
            duration,
            listPrice,
               1,
          intermediary.address,
          100,
          "0x0000000000000000000000000000000000000000"
        )
      ).eventually.rejectedWith(
        `intermediaryFeePercentage must be less than 100`
      );
    });

    it("should create an listing", async () => {
      const owner = await item.ownerOf(0);
      const [_, expectedIntermediary] = await ethers.getSigners();
      await createListing(itemListing, await expectedIntermediary.getAddress());

      const createdListing = await itemListing.listings(0);

      expect(createdListing.duration).to.eq(24 * 60 * 60);
      expect(createdListing.listPrice).to.eq(
        BigNumber.from(10).pow(18).div(2)
      );
      expect(createdListing.intermediaryFeePercentage).to.eq(5);
      expect(createdListing.tokenOwner).to.eq(owner);
      expect(createdListing.intermediary).to.eq(expectedIntermediary.address);
      expect(createdListing.approved).to.eq(false);
    });

    it("should be automatically approved if the creator is the intermediary", async () => {
      const owner = await item.ownerOf(0);
      await createListing(itemListing, owner);

      const createdListing = await itemListing.listings(0);

      expect(createdListing.approved).to.eq(true);
    });

    it("should be automatically approved if the creator is the Zero Address", async () => {
      await createListing(itemListing, ethers.constants.AddressZero);

      const createdListing = await itemListing.listings(0);

      expect(createdListing.approved).to.eq(true);
    });

    it("should emit an ListingCreated event", async () => {
      const owner = await item.ownerOf(0);
      const [_, expectedIntermediary] = await ethers.getSigners();

      const block = await ethers.provider.getBlockNumber();
      await createListing(itemListing, await expectedIntermediary.getAddress());
      const currListing = await itemListing.listings(0);
      const events = await itemListing.queryFilter(
        itemListing.filters.ListingCreated(
          null,
          null,
          null,
          null,
          null,
          null,
          null,
            null,
              null,
          null,
          null
        ),
        block
      );
      expect(events.length).eq(1);
      const logDescription = itemListing.interface.parseLog(events[0]);
      expect(logDescription.name).to.eq("ListingCreated");
      expect(logDescription.args.duration).to.eq(currListing.duration);
      expect(logDescription.args.listPrice).to.eq(currListing.listPrice);
      expect(logDescription.args.tokenOwner).to.eq(currListing.tokenOwner);
      expect(logDescription.args.intermediary).to.eq(currListing.intermediary);
      expect(logDescription.args.intermediaryFeePercentage).to.eq(
        currListing.intermediaryFeePercentage
      );
      expect(logDescription.args.listCurrency).to.eq(
        ethers.constants.AddressZero
      );
    });
  });

  describe("#setListingApproval", () => {
    let itemListing: ItemListing;
    let admin: Signer;
    let intermediary: Signer;
    let bidder: Signer;

    beforeEach(async () => {
      [admin, intermediary, bidder] = await ethers.getSigners();
      itemListing = (await deploy()).connect(intermediary) as ItemListing;
      await mint(item);
      await approveListing(item, itemListing);
        await ethers.provider.send("evm_setNextBlockTimestamp", [999]);
      await createListing(
        itemListing.connect(admin),
        await intermediary.getAddress(),
           "1000"
      );
         await ethers.provider.send("evm_setNextBlockTimestamp", [1001]);
    });


  await ethers.provider.send("evm_setNextBlockTimestamp", [999]);
      await createListing(
        itemListing.connect(creator),
        await intermediary.getAddress(),
         "1000"
      );
         await ethers.provider.send("evm_setNextBlockTimestamp", [1001]);
    });
    


    it("should revert if the itemListing does not exist", async () => {
      await expect(
        itemListing.setListingApproval(1, true)
      ).eventually.rejectedWith(`Listing doesn't exist`);
    });

    it("should revert if not called by the intermediary", async () => {
      await expect(
        itemListing.connect(admin).setListingApproval(0, true)
      ).eventually.rejectedWith(`Must be listing intermediary`);
    });

    it("should revert if the listing has already started", async () => {
      await itemListing.setListingApproval(0, true);
      await itemListing
        .connect(bidder)
        .createBid(0, ONE_MOTIF, { value: ONE_MOTIF });
      await expect(
        itemListing.setListingApproval(0, false)
      ).eventually.rejectedWith(`Listing has already started`);
    });

    it("should set the listing as approved", async () => {
      await itemListing.setListingApproval(0, true);

      expect((await itemListing.listings(0)).approved).to.eq(true);
    });

    it("should emit an ListingApproved event", async () => {
      const block = await ethers.provider.getBlockNumber();
      await itemListing.setListingApproval(0, true);
      const events = await itemListing.queryFilter(
        itemListing.filters.ListingApprovalUpdated(null, null, null, null),
        block
      );
      expect(events.length).eq(1);
      const logDescription = itemListing.interface.parseLog(events[0]);

      expect(logDescription.args.approved).to.eq(true);
    });
  });

  describe("#setListingListPrice", () => {
    let itemListing: ItemListing;
    let admin: Signer;
    let creator: Signer;
    let intermediary: Signer;
    let bidder: Signer;

    beforeEach(async () => {
      [admin, creator, intermediary, bidder] = await ethers.getSigners();
      itemListing = (await deploy()).connect(intermediary) as ItemListing;
      await mint(item.connect(creator));
      await approveListing(
        item.connect(creator),
        itemListing.connect(creator)
      );
      	  await ethers.provider.send("evm_setNextBlockTimestamp", [999]);
      await createListing(
        itemListing.connect(creator),
        await intermediary.getAddress(),
         "1000"
      );
         await ethers.provider.send("evm_setNextBlockTimestamp", [1001]);
    });
    
 


    it("should revert if the itemListing does not exist", async () => {
      await expect(
        itemListing.setListingListPrice(1, TWO_MOTIF)
      ).eventually.rejectedWith(`Listing doesn't exist`);
    });

    it("should revert if not called by the intermediary or owner", async () => {
      await expect(
        itemListing.connect(admin).setListingListPrice(0, TWO_MOTIF)
      ).eventually.rejectedWith(`Must be listing intermediary`);
    });

    it("should revert if the listing has already started", async () => {
      await itemListing.setListingListPrice(0, TWO_MOTIF);
      await itemListing.setListingApproval(0, true);
      await itemListing
        .connect(bidder)
        .createBid(0, TWO_MOTIF, { value: TWO_MOTIF });
      await expect(
        itemListing.setListingListPrice(0, ONE_MOTIF)
      ).eventually.rejectedWith(`Listing has already started`);
    });

    it("should set the listing reserve price when called by the intermediary", async () => {
      await itemListing.setListingListPrice(0, TWO_MOTIF);

      expect((await itemListing.listings(0)).listPrice).to.eq(TWO_MOTIF);
    });

    it("should set the listing reserve price when called by the token owner", async () => {
      await itemListing.connect(creator).setListingListPrice(0, TWO_MOTIF);

      expect((await itemListing.listings(0)).listPrice).to.eq(TWO_MOTIF);
    });

    it("should emit an ListingListPriceUpdated event", async () => {
      const block = await ethers.provider.getBlockNumber();
      await itemListing.setListingListPrice(0, TWO_MOTIF);
      const events = await itemListing.queryFilter(
        itemListing.filters.ListingListPriceUpdated(null, null, null, null),
        block
      );
      expect(events.length).eq(1);
      const logDescription = itemListing.interface.parseLog(events[0]);

      expect(logDescription.args.listPrice).to.eq(TWO_MOTIF);
    });
  });

  describe("#createBid", () => {
    let itemListing: ItemListing;
    let admin: Signer;
    let intermediary: Signer;
    let bidderA: Signer;
    let bidderB: Signer;

    beforeEach(async () => {
      [admin, intermediary, bidderA, bidderB] = await ethers.getSigners();

		  await ethers.provider.send("evm_setNextBlockTimestamp", [999]);

      itemListing = (await (await deploy()).connect(bidderA)) as ItemListing;
      await mint(item);
      await approveListing(item, itemListing);
      await createListing(
        itemListing.connect(admin),
        await intermediary.getAddress(),
        "1000"
      );
       await ethers.provider.send("evm_setNextBlockTimestamp", [1001]);
      await itemListing.connect(intermediary).setListingApproval(0, true);
    });

    it("should revert if the specified listing does not exist", async () => {
      await expect(
        itemListing.createBid(11111, ONE_MOTIF)
      ).eventually.rejectedWith(`Listing doesn't exist`);
    });

    it("should revert if the specified listing is not approved", async () => {
      await itemListing.connect(intermediary).setListingApproval(0, false);
      await expect(
        itemListing.createBid(0, ONE_MOTIF, { value: ONE_MOTIF })
      ).eventually.rejectedWith(`Listing must be approved by intermediary`);
    });

    it("should revert if the bid is less than the reserve price", async () => {
      await expect(
        itemListing.createBid(0, 0, { value: 0 })
      ).eventually.rejectedWith(`Must send at least listPrice`);
    });

    it("should revert if the bid is invalid for share splitting", async () => {
      await expect(
        itemListing.createBid(0, ONE_MOTIF.add(1), {
          value: ONE_MOTIF.add(1),
        })
      ).eventually.rejectedWith(`Bid invalid for share splitting`);
    });

    it("should revert if msg.value does not equal specified amount", async () => {
      await expect(
        itemListing.createBid(0, ONE_MOTIF, {
          value: ONE_MOTIF.mul(2),
        })
      ).eventually.rejectedWith(
        `Sent MOTIF Value does not match specified bid amount`
      );
    });
    describe("first bid", () => {
      it("should set the first bid time", async () => {
        // TODO: Fix this test on Sun Oct 04 2274
        await ethers.provider.send("evm_setNextBlockTimestamp", [9617249934]);
        await itemListing.createBid(0, ONE_MOTIF, {
          value: ONE_MOTIF,
        });
        expect((await itemListing.listings(0)).firstBidTime).to.eq(9617249934);
      });

      it("should store the transferred MOTIF as WMOTIF", async () => {
        await itemListing.createBid(0, ONE_MOTIF, {
          value: ONE_MOTIF,
        });
        expect(await wmotif.balanceOf(itemListing.address)).to.eq(ONE_MOTIF);
      });

      it("should not update the listing's duration", async () => {
        const beforeDuration = (await itemListing.listings(0)).duration;
        await itemListing.createBid(0, ONE_MOTIF, {
          value: ONE_MOTIF,
        });
        const afterDuration = (await itemListing.listings(0)).duration;

        expect(beforeDuration).to.eq(afterDuration);
      });

      it("should store the bidder's information", async () => {
        await itemListing.createBid(0, ONE_MOTIF, {
          value: ONE_MOTIF,
        });
        const currListing = await itemListing.listings(0);

        expect(currListing.bidder).to.eq(await bidderA.getAddress());
        expect(currListing.amount).to.eq(ONE_MOTIF);
      });

      it("should emit an ListingBid event", async () => {
        const block = await ethers.provider.getBlockNumber();
        await itemListing.createBid(0, ONE_MOTIF, {
          value: ONE_MOTIF,
        });
        const events = await itemListing.queryFilter(
          itemListing.filters.ListingBid(
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ),
          block
        );
        expect(events.length).eq(1);
        const logDescription = itemListing.interface.parseLog(events[0]);

        expect(logDescription.name).to.eq("ListingBid");
        expect(logDescription.args.listingId).to.eq(0);
        expect(logDescription.args.sender).to.eq(await bidderA.getAddress());
        expect(logDescription.args.value).to.eq(ONE_MOTIF);
        expect(logDescription.args.firstBid).to.eq(true);
        expect(logDescription.args.extended).to.eq(false);
      });
    });

    describe("second bid", () => {
      beforeEach(async () => {
        itemListing = itemListing.connect(bidderB) as ItemListing;
        await itemListing
          .connect(bidderA)
          .createBid(0, ONE_MOTIF, { value: ONE_MOTIF });
      });

      it("should revert if the bid is smaller than the last bid + minBid", async () => {
        await expect(
          itemListing.createBid(0, ONE_MOTIF.add(1), {
            value: ONE_MOTIF.add(1),
          })
        ).eventually.rejectedWith(
          `Must send more than last bid by minBidIncrementPercentage amount`
        );
      });

      it("should refund the previous bid", async () => {
        const beforeBalance = await ethers.provider.getBalance(
          await bidderA.getAddress()
        );
        const beforeBidAmount = (await itemListing.listings(0)).amount;
        await itemListing.createBid(0, TWO_MOTIF, {
          value: TWO_MOTIF,
        });
        const afterBalance = await ethers.provider.getBalance(
          await bidderA.getAddress()
        );

        expect(afterBalance).to.eq(beforeBalance.add(beforeBidAmount));
      });

      it("should not update the firstBidTime", async () => {
        const firstBidTime = (await itemListing.listings(0)).firstBidTime;
        await itemListing.createBid(0, TWO_MOTIF, {
          value: TWO_MOTIF,
        });
        expect((await itemListing.listings(0)).firstBidTime).to.eq(
          firstBidTime
        );
      });

      it("should transfer the bid to the contract and store it as WMOTIF", async () => {
        await itemListing.createBid(0, TWO_MOTIF, {
          value: TWO_MOTIF,
        });

        expect(await wmotif.balanceOf(itemListing.address)).to.eq(TWO_MOTIF);
      });

      it("should update the stored bid information", async () => {
        await itemListing.createBid(0, TWO_MOTIF, {
          value: TWO_MOTIF,
        });

        const currListing = await itemListing.listings(0);

        expect(currListing.amount).to.eq(TWO_MOTIF);
        expect(currListing.bidder).to.eq(await bidderB.getAddress());
      });

      it("should not extend the duration of the bid if outside of the time buffer", async () => {
        const beforeDuration = (await itemListing.listings(0)).duration;
        await itemListing.createBid(0, TWO_MOTIF, {
          value: TWO_MOTIF,
        });
        const afterDuration = (await itemListing.listings(0)).duration;
        expect(beforeDuration).to.eq(afterDuration);
      });

      it("should emit an ListingBid event", async () => {
        const block = await ethers.provider.getBlockNumber();
        await itemListing.createBid(0, TWO_MOTIF, {
          value: TWO_MOTIF,
        });
        const events = await itemListing.queryFilter(
          itemListing.filters.ListingBid(
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ),
          block
        );
        expect(events.length).eq(2);
        const logDescription = itemListing.interface.parseLog(events[1]);

        expect(logDescription.name).to.eq("ListingBid");
        expect(logDescription.args.sender).to.eq(await bidderB.getAddress());
        expect(logDescription.args.value).to.eq(TWO_MOTIF);
        expect(logDescription.args.firstBid).to.eq(false);
        expect(logDescription.args.extended).to.eq(false);
      });

      describe("last minute bid", () => {
        beforeEach(async () => {
          const currListing = await itemListing.listings(0);
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            currListing.firstBidTime
              .add(currListing.duration)
              .sub(1)
              .toNumber(),
          ]);
        });
        it("should extend the duration of the bid if inside of the time buffer", async () => {
          const beforeDuration = (await itemListing.listings(0)).duration;
          await itemListing.createBid(0, TWO_MOTIF, {
            value: TWO_MOTIF,
          });

          const currListing = await itemListing.listings(0);
          expect(currListing.duration).to.eq(
            beforeDuration.add(await itemListing.timeBuffer()).sub(1)
          );
        });
        it("should emit an ListingBid event", async () => {
          const block = await ethers.provider.getBlockNumber();
          await itemListing.createBid(0, TWO_MOTIF, {
            value: TWO_MOTIF,
          });
          const events = await itemListing.queryFilter(
            itemListing.filters.ListingBid(
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ),
            block
          );
          expect(events.length).eq(2);
          const logDescription = itemListing.interface.parseLog(events[1]);

          expect(logDescription.name).to.eq("ListingBid");
          expect(logDescription.args.sender).to.eq(await bidderB.getAddress());
          expect(logDescription.args.value).to.eq(TWO_MOTIF);
          expect(logDescription.args.firstBid).to.eq(false);
          expect(logDescription.args.extended).to.eq(true);
        });
      });
      describe("late bid", () => {
        beforeEach(async () => {
          const currListing = await itemListing.listings(0);
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            currListing.firstBidTime
              .add(currListing.duration)
              .add(1)
              .toNumber(),
          ]);
        });

        it("should revert if the bid is placed after expiry", async () => {
          await expect(
            itemListing.createBid(0, TWO_MOTIF, {
              value: TWO_MOTIF,
            })
          ).eventually.rejectedWith(`Listing expired`);
        });
      });
    });
  });

  describe("#cancelListing", () => {
    let itemListing: ItemListing;
    let admin: Signer;
    let creator: Signer;
    let intermediary: Signer;
    let bidder: Signer;

    beforeEach(async () => {
      [admin, creator, intermediary, bidder] = await ethers.getSigners();
      itemListing = (await deploy()).connect(creator) as ItemListing;
      await mint(item.connect(creator));
      await approveListing(item.connect(creator), itemListing);
         await ethers.provider.send("evm_setNextBlockTimestamp", [999]);
      await createListing(
        itemListing.connect(creator),
        await intermediary.getAddress(),
           "1000"
      );
       await ethers.provider.send("evm_setNextBlockTimestamp", [1001]);
      await itemListing.connect(intermediary).setListingApproval(0, true);
    });

   

    it("should revert if the listing does not exist", async () => {
      await expect(itemListing.cancelListing(12213)).eventually.rejectedWith(
        `Listing doesn't exist`
      );
    });

    it("should revert if not called by a creator or intermediary", async () => {
      await expect(
        itemListing.connect(bidder).cancelListing(0)
      ).eventually.rejectedWith(
        `Can only be called by listing creator or intermediary`
      );
    });

    it("should revert if the listing has already begun", async () => {
      await itemListing
        .connect(bidder)
        .createBid(0, ONE_MOTIF, { value: ONE_MOTIF });
      await expect(itemListing.cancelListing(0)).eventually.rejectedWith(
        `Can't cancel an listing once it's begun`
      );
    });

    it("should be callable by the creator", async () => {
      await itemListing.cancelListing(0);

      const listingResult = await itemListing.listings(0);

      expect(listingResult.amount.toNumber()).to.eq(0);
      expect(listingResult.duration.toNumber()).to.eq(0);
      expect(listingResult.firstBidTime.toNumber()).to.eq(0);
      expect(listingResult.listPrice.toNumber()).to.eq(0);
      expect(listingResult.intermediaryFeePercentage).to.eq(0);
      expect(listingResult.tokenOwner).to.eq(ethers.constants.AddressZero);
      expect(listingResult.bidder).to.eq(ethers.constants.AddressZero);
      expect(listingResult.intermediary).to.eq(ethers.constants.AddressZero);
      expect(listingResult.listCurrency).to.eq(ethers.constants.AddressZero);

      expect(await item.ownerOf(0)).to.eq(await creator.getAddress());
    });

    it("should be callable by the intermediary", async () => {
      await itemListing.connect(intermediary).cancelListing(0);

      const listingResult = await itemListing.listings(0);

      expect(listingResult.amount.toNumber()).to.eq(0);
      expect(listingResult.duration.toNumber()).to.eq(0);
      expect(listingResult.firstBidTime.toNumber()).to.eq(0);
      expect(listingResult.listPrice.toNumber()).to.eq(0);
      expect(listingResult.intermediaryFeePercentage).to.eq(0);
      expect(listingResult.tokenOwner).to.eq(ethers.constants.AddressZero);
      expect(listingResult.bidder).to.eq(ethers.constants.AddressZero);
      expect(listingResult.intermediary).to.eq(ethers.constants.AddressZero);
      expect(listingResult.listCurrency).to.eq(ethers.constants.AddressZero);
      expect(await item.ownerOf(0)).to.eq(await creator.getAddress());
    });

    it("should emit an ListingCanceled event", async () => {
      const block = await ethers.provider.getBlockNumber();
      await itemListing.cancelListing(0);
      const events = await itemListing.queryFilter(
        itemListing.filters.ListingCanceled(null, null, null, null),
        block
      );
      expect(events.length).eq(1);
      const logDescription = itemListing.interface.parseLog(events[0]);

      expect(logDescription.args.tokenId.toNumber()).to.eq(0);
      expect(logDescription.args.tokenOwner).to.eq(await creator.getAddress());
      expect(logDescription.args.tokenContract).to.eq(item.address);
    });
  });

  describe("#endListing", () => {
    let itemListing: ItemListing;
    let admin: Signer;
    let creator: Signer;
    let intermediary: Signer;
    let bidder: Signer;
    let other: Signer;
    let badBidder: BadBidder;

    beforeEach(async () => {
      [admin, creator, intermediary, bidder, other] = await ethers.getSigners();
      itemListing = (await deploy()) as ItemListing;
      await mint(item.connect(creator));
      await approveListing(item.connect(creator), itemListing);
await ethers.provider.send("evm_setNextBlockTimestamp", [999]);
      await createListing(
        itemListing.connect(creator),
        await intermediary.getAddress(),
            "1000"
      );
        await ethers.provider.send("evm_setNextBlockTimestamp", [1001]);
      await itemListing.connect(intermediary).setListingApproval(0, true);
      badBidder = await deployBidder(itemListing.address, item.address);
    });






    it("should revert if the listing does not exist", async () => {
      await expect(itemListing.endListing(1110)).eventually.rejectedWith(
        `Listing doesn't exist`
      );
    });

    it("should revert if the listing has not begun", async () => {
      await expect(itemListing.endListing(0)).eventually.rejectedWith(
        `Listing hasn't begun`
      );
    });

    it("should revert if the listing has not completed", async () => {
      await itemListing.createBid(0, ONE_MOTIF, {
        value: ONE_MOTIF,
      });

      await expect(itemListing.endListing(0)).eventually.rejectedWith(
        `Listing hasn't completed`
      );
    });

    it("should cancel the listing if the winning bidder is unable to receive NFTs", async () => {
      await badBidder.placeBid(0, TWO_MOTIF, { value: TWO_MOTIF });
      const endTime =
        (await itemListing.listings(0)).duration.toNumber() +
        (await itemListing.listings(0)).firstBidTime.toNumber();
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);

      await itemListing.endListing(0);

      expect(await item.ownerOf(0)).to.eq(await creator.getAddress());
      expect(await ethers.provider.getBalance(badBidder.address)).to.eq(
        TWO_MOTIF
      );
    });

    describe("MOTIF listing", () => {
      beforeEach(async () => {
        await itemListing
          .connect(bidder)
          .createBid(0, ONE_MOTIF, { value: ONE_MOTIF });
        const endTime =
          (await itemListing.listings(0)).duration.toNumber() +
          (await itemListing.listings(0)).firstBidTime.toNumber();
        await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      });

      it("should transfer the NFT to the winning bidder", async () => {
        await itemListing.endListing(0);

        expect(await item.ownerOf(0)).to.eq(await bidder.getAddress());
      });

      it("should pay the intermediary their intermediaryFee percentage", async () => {
        const beforeBalance = await ethers.provider.getBalance(
          await intermediary.getAddress()
        );
        await itemListing.endListing(0);
        const expectedIntermediaryFee = "42500000000000000";
        const intermediaryBalance = await ethers.provider.getBalance(
          await intermediary.getAddress()
        );
        await expect(intermediaryBalance.sub(beforeBalance).toString()).to.eq(
          expectedIntermediaryFee
        );
      });

      it("should pay the creator the remainder of the winning bid", async () => {
        const beforeBalance = await ethers.provider.getBalance(
          await creator.getAddress()
        );
        await itemListing.endListing(0);
        const expectedProfit = "957500000000000000";
        const creatorBalance = await ethers.provider.getBalance(
          await creator.getAddress()
        );
        const wmotifBalance = await wmotif.balanceOf(await creator.getAddress());
        await expect(
          creatorBalance.sub(beforeBalance).add(wmotifBalance).toString()
        ).to.eq(expectedProfit);
      });

      it("should emit an ListingEnded event", async () => {
        const block = await ethers.provider.getBlockNumber();
        const listingData = await itemListing.listings(0);
        await itemListing.endListing(0);
        const events = await itemListing.queryFilter(
          itemListing.filters.ListingEnded(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ),
          block
        );
        expect(events.length).eq(1);
        const logDescription = itemListing.interface.parseLog(events[0]);

        expect(logDescription.args.tokenId).to.eq(0);
        expect(logDescription.args.tokenOwner).to.eq(listingData.tokenOwner);
        expect(logDescription.args.intermediary).to.eq(listingData.intermediary);
        expect(logDescription.args.winner).to.eq(listingData.bidder);
        expect(logDescription.args.amount.toString()).to.eq(
          "807500000000000000"
        );
        expect(logDescription.args.intermediaryFee.toString()).to.eq(
          "42500000000000000"
        );
        expect(logDescription.args.listCurrency).to.eq(wmotif.address);
      });

      it("should delete the listing", async () => {
        await itemListing.endListing(0);

        const listingResult = await itemListing.listings(0);

        expect(listingResult.amount.toNumber()).to.eq(0);
        expect(listingResult.duration.toNumber()).to.eq(0);
        expect(listingResult.firstBidTime.toNumber()).to.eq(0);
        expect(listingResult.listPrice.toNumber()).to.eq(0);
        expect(listingResult.intermediaryFeePercentage).to.eq(0);
        expect(listingResult.tokenOwner).to.eq(ethers.constants.AddressZero);
        expect(listingResult.bidder).to.eq(ethers.constants.AddressZero);
        expect(listingResult.intermediary).to.eq(ethers.constants.AddressZero);
        expect(listingResult.listCurrency).to.eq(
          ethers.constants.AddressZero
        );
      });
    });
  });
});
