// @ts-ignore
import { ethers } from "hardhat";
import chai, { expect } from "chai";
import asPromised from "chai-as-promised";
import {
  deployOtherNFTs,
  deployWMOTIF,
  deployMotifProtocol,
  mint,
  ONE_MOTIF,
  TENTH_MOTIF,
  THOUSANDTH_MOTIF,
  TWO_MOTIF,
} from "./utils";
import { ItemExchange, Item } from "@motif-foundation/asset/dist/typechain";
import { BigNumber, Signer } from "ethers";
import { ItemListing, TestERC721, WMOTIF } from "../typechain";

chai.use(asPromised);

const ONE_DAY = 24 * 60 * 60;

// helper function so we can parse numbers and do approximate number calculations, to avoid annoying gas calculations
const smallify = (bn: BigNumber) => bn.div(THOUSANDTH_MOTIF).toNumber();

describe("integration", () => {
  let itemExchange: ItemExchange;
  let item: Item;
  let wmotif: WMOTIF;
  let listing: ItemListing;
  let otherNft: TestERC721;
  let deployer, creator, owner, intermediary, bidderA, bidderB, otherUser: Signer;
  let deployerAddress,
    ownerAddress,
    creatorAddress,
    intermediaryAddress,
    bidderAAddress,
    bidderBAddress,
    otherUserAddress: string;

  async function deploy(): Promise<ItemListing> {
    const ItemListing = await ethers.getContractFactory("ItemListing");
    const itemListing = await ItemListing.deploy(item.address, wmotif.address);

    return itemListing as ItemListing;
  }

  beforeEach(async () => {
    await ethers.provider.send("hardhat_reset", []);
    [
      deployer,
      creator,
      owner,
      intermediary,
      bidderA,
      bidderB,
      otherUser,
    ] = await ethers.getSigners();
    [
      deployerAddress,
      creatorAddress,
      ownerAddress,
      intermediaryAddress,
      bidderAAddress,
      bidderBAddress,
      otherUserAddress,
    ] = await Promise.all(
      [deployer, creator, owner, intermediary, bidderA, bidderB].map((s) =>
        s.getAddress()
      )
    );
    const contracts = await deployMotifProtocol();
    const nfts = await deployOtherNFTs();
    itemExchange = contracts.itemExchange;
    item = contracts.item;
    wmotif = await deployWMOTIF();
    listing = await deploy();
    otherNft = nfts.test;
    await mint(item.connect(creator));
    await otherNft.mint(creator.address, 0);
    await item.connect(creator).transferFrom(creatorAddress, ownerAddress, 0);
    await otherNft
      .connect(creator)
      .transferFrom(creatorAddress, ownerAddress, 0);
  });

  describe("MOTIF Listing with no intermediary", async () => {
    async function run() {
      await item.connect(owner).approve(listing.address, 0);
        await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await listing
        .connect(owner)
        .createListing(
          0,
          item.address,
           Date.now() ,
          ONE_DAY,
          TENTH_MOTIF,
          1,
          ethers.constants.AddressZero,
          0,
          ethers.constants.AddressZero
        );
      await listing.connect(bidderA).createBid(0, ONE_MOTIF, { value: ONE_MOTIF });
      await listing.connect(bidderB).createBid(0, TWO_MOTIF, { value: TWO_MOTIF });
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY+ ONE_DAY,
      ]);
      await listing.connect(otherUser).endListing(0);
    }
 
    it("should transfer the NFT to the winning bidder", async () => {
      await run();
      expect(await item.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderBAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderBAddress);

      expect(smallify(beforeBalance.sub(afterBalance))).to.be.approximately(
        smallify(TWO_MOTIF),
        smallify(TENTH_MOTIF)
      );
    });

    it("should refund the losing bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderAAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderAAddress);

      expect(smallify(beforeBalance)).to.be.approximately(
        smallify(afterBalance),
        smallify(TENTH_MOTIF)
      );
    });

    it("should pay the listing creator", async () => {
      const beforeBalance = await ethers.provider.getBalance(ownerAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(ownerAddress);

      // 15% creator fee -> 2MOTIF * 85% = 1.7 MOTIF
      expect(smallify(afterBalance)).to.be.approximately(
        smallify(beforeBalance.add(TENTH_MOTIF.mul(17))),
        smallify(TENTH_MOTIF)
      );
    });

    it("should pay the token creator in WMOTIF", async () => {
      const beforeBalance = await wmotif.balanceOf(creatorAddress);
      await run();
      const afterBalance = await wmotif.balanceOf(creatorAddress);

      // 15% creator fee -> 2 MOTIF * 15% = 0.3 WMOTIF
      expect(afterBalance).to.eq(beforeBalance.add(THOUSANDTH_MOTIF.mul(300)));
    });
  });

  describe("MOTIF listing with intermediary", () => {
    async function run() {
      await item.connect(owner).approve(listing.address, 0);
       await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await listing
        .connect(owner)
        .createListing(
          0,
          item.address,
          Date.now(),
          ONE_DAY,
          TENTH_MOTIF,
          1,
          intermediaryAddress,
          20,
          ethers.constants.AddressZero
        );
      await listing.connect(intermediary).setListingApproval(0, true);
      await listing.connect(bidderA).createBid(0, ONE_MOTIF, { value: ONE_MOTIF });
      await listing.connect(bidderB).createBid(0, TWO_MOTIF, { value: TWO_MOTIF });
        await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY+ ONE_DAY,
      ]);
      await listing.connect(otherUser).endListing(0);
    }



    it("should transfer the NFT to the winning bidder", async () => {
      await run();
      expect(await item.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderBAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderBAddress);

      expect(smallify(beforeBalance.sub(afterBalance))).to.be.approximately(
        smallify(TWO_MOTIF),
        smallify(TENTH_MOTIF)
      );
    });

    it("should refund the losing bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderAAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderAAddress);

      expect(smallify(beforeBalance)).to.be.approximately(
        smallify(afterBalance),
        smallify(TENTH_MOTIF)
      );
    });

    it("should pay the listing creator", async () => {
      const beforeBalance = await ethers.provider.getBalance(ownerAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(ownerAddress);

      expect(smallify(afterBalance)).to.be.approximately(
        // 15% creator share + 20% intermediary fee  -> 1.7 MOTIF * 80% = 1.36 MOTIF
        smallify(beforeBalance.add(TENTH_MOTIF.mul(14))),
        smallify(TENTH_MOTIF)
      );
    });

    it("should pay the token creator in WMOTIF", async () => {
      const beforeBalance = await wmotif.balanceOf(creatorAddress);
      await run();
      const afterBalance = await wmotif.balanceOf(creatorAddress);

      // 15% creator fee  -> 2 MOTIF * 15% = 0.3 WMOTIF
      expect(afterBalance).to.eq(beforeBalance.add(THOUSANDTH_MOTIF.mul(300)));
    });

    it("should pay the intermediary", async () => {
      const beforeBalance = await ethers.provider.getBalance(intermediaryAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(intermediaryAddress);

      // 20% of 1.7 WMOTIF -> 0.34
      expect(smallify(afterBalance)).to.be.approximately(
        smallify(beforeBalance.add(THOUSANDTH_MOTIF.mul(340))),
        smallify(TENTH_MOTIF)
      );
    });
  });


  describe("WMOTIF Listing with no intermediary", () => {
    async function run() {
      await item.connect(owner).approve(listing.address, 0);
        await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await listing
        .connect(owner)
        .createListing(
          0,
          item.address,
          Date.now(),
          ONE_DAY,
          TENTH_MOTIF,
           1,
          ethers.constants.AddressZero,
          20,
          wmotif.address
        );
      await wmotif.connect(bidderA).deposit({ value: ONE_MOTIF });
      await wmotif.connect(bidderA).approve(listing.address, ONE_MOTIF);
      await wmotif.connect(bidderB).deposit({ value: TWO_MOTIF });
      await wmotif.connect(bidderB).approve(listing.address, TWO_MOTIF);
      await listing.connect(bidderA).createBid(0, ONE_MOTIF, { value: ONE_MOTIF });
      await listing.connect(bidderB).createBid(0, TWO_MOTIF, { value: TWO_MOTIF });
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY + ONE_DAY,
      ]);
      await listing.connect(otherUser).endListing(0);
    }

    it("should transfer the NFT to the winning bidder", async () => {
      await run();
      expect(await item.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      await run();
      const afterBalance = await wmotif.balanceOf(bidderBAddress);

      expect(afterBalance).to.eq(ONE_MOTIF.mul(0));
    });

    it("should refund the losing bidder", async () => {
      await run();
      const afterBalance = await wmotif.balanceOf(bidderAAddress);

      expect(afterBalance).to.eq(ONE_MOTIF);
    });

    it("should pay the listing creator", async () => {
      await run();
      const afterBalance = await wmotif.balanceOf(ownerAddress);

      // 15% creator fee -> 2 MOTIF * 85% = 1.7WMOTIF
      expect(afterBalance).to.eq(TENTH_MOTIF.mul(17));
    });

    it("should pay the token creator", async () => {
      const beforeBalance = await wmotif.balanceOf(creatorAddress);
      await run();
      const afterBalance = await wmotif.balanceOf(creatorAddress);

      // 15% creator fee -> 2 MOTIF * 15% = 0.3 WMOTIF
      expect(afterBalance).to.eq(beforeBalance.add(THOUSANDTH_MOTIF.mul(300)));
    });
  });


  describe("WMOTIF listing with intermediary", async () => {
    async function run() {
      await item.connect(owner).approve(listing.address, 0);
          await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await listing
        .connect(owner)
        .createListing(
          0,
          item.address,
          Date.now() ,
          ONE_DAY,
          TENTH_MOTIF,
              1,
          intermediary.address,
          20,
          wmotif.address
        );
      await listing.connect(intermediary).setListingApproval(0, true);
      await wmotif.connect(bidderA).deposit({ value: ONE_MOTIF });
      await wmotif.connect(bidderA).approve(listing.address, ONE_MOTIF);
      await wmotif.connect(bidderB).deposit({ value: TWO_MOTIF });
      await wmotif.connect(bidderB).approve(listing.address, TWO_MOTIF);
      await listing.connect(bidderA).createBid(0, ONE_MOTIF, { value: ONE_MOTIF });
      await listing.connect(bidderB).createBid(0, TWO_MOTIF, { value: TWO_MOTIF });
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY+ ONE_DAY,
      ]);
      await listing.connect(otherUser).endListing(0);
    }

    it("should transfer the NFT to the winning bidder", async () => {
      await run();
      expect(await item.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      await run();
      const afterBalance = await wmotif.balanceOf(bidderBAddress);

      expect(afterBalance).to.eq(ONE_MOTIF.mul(0));
    });

    it("should refund the losing bidder", async () => {
      await run();
      const afterBalance = await wmotif.balanceOf(bidderAAddress);

      expect(afterBalance).to.eq(ONE_MOTIF);
    });

    it("should pay the listing creator", async () => {
      await run();
      const afterBalance = await wmotif.balanceOf(ownerAddress);

      // 15% creator fee + 20% intermediary fee -> 2 MOTIF * 85% * 80% = 1.36WMOTIF
      expect(afterBalance).to.eq(THOUSANDTH_MOTIF.mul(1360));
    });

    it("should pay the token creator", async () => {
      const beforeBalance = await wmotif.balanceOf(creatorAddress);
      await run();
      const afterBalance = await wmotif.balanceOf(creatorAddress);

      // 15% creator fee -> 2 MOTIF * 15% = 0.3 WMOTIF
      expect(afterBalance).to.eq(beforeBalance.add(THOUSANDTH_MOTIF.mul(300)));
    });

    it("should pay the listing intermediary", async () => {
      const beforeBalance = await wmotif.balanceOf(intermediaryAddress);
      await run();
      const afterBalance = await wmotif.balanceOf(intermediaryAddress);

      // 15% creator fee + 20% intermediary fee = 2 MOTIF * 85% * 20% = 0.34 WMOTIF
      expect(afterBalance).to.eq(beforeBalance.add(THOUSANDTH_MOTIF.mul(340)));
    });
  });

  describe("3rd party nft listing", async () => {
    async function run() {
      await otherNft.connect(owner).approve(listing.address, 0);
         await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await listing
        .connect(owner)
        .createListing(
          0,
          otherNft.address,
            Date.now() ,
          ONE_DAY,
          TENTH_MOTIF,
            1,
          intermediaryAddress,
          20,
          ethers.constants.AddressZero
        );
      await listing.connect(intermediary).setListingApproval(0, true);
      await listing.connect(bidderA).createBid(0, ONE_MOTIF, { value: ONE_MOTIF });
      await listing.connect(bidderB).createBid(0, TWO_MOTIF, { value: TWO_MOTIF });
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY+ ONE_DAY,
      ]);
      await listing.connect(otherUser).endListing(0);
    }
    it("should transfer the NFT to the winning bidder", async () => {
      await run();
      expect(await otherNft.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderBAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderBAddress);

      expect(smallify(beforeBalance.sub(afterBalance))).to.be.approximately(
        smallify(TWO_MOTIF),
        smallify(TENTH_MOTIF)
      );
    });

    it("should refund the losing bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderAAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderAAddress);

      expect(smallify(beforeBalance)).to.be.approximately(
        smallify(afterBalance),
        smallify(TENTH_MOTIF)
      );
    });

    it("should pay the listing creator", async () => {
      const beforeBalance = await ethers.provider.getBalance(ownerAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(ownerAddress);

      expect(smallify(afterBalance)).to.be.approximately(
        // 20% intermediary fee  -> 2 MOTIF * 80% = 1.6 MOTIF
        smallify(beforeBalance.add(TENTH_MOTIF.mul(16))),
        smallify(TENTH_MOTIF)
      );
    });

    it("should pay the intermediary", async () => {
      const beforeBalance = await ethers.provider.getBalance(intermediaryAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(intermediaryAddress);

      // 20% of 2 WMOTIF -> 0.4
      expect(smallify(afterBalance)).to.be.approximately(
        smallify(beforeBalance.add(TENTH_MOTIF.mul(4))),
        smallify(THOUSANDTH_MOTIF)
      );
    });
  });
});
