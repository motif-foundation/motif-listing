// @ts-ignore
import { ethers } from "hardhat";
import {
  ItemExchangeFactory,
  Item,
  ItemFactory,
} from "@motif-foundation/asset/dist/typechain";
import {
  BadBidder,
  ItemListing,
  WMOTIF,
  BadERC721,
  TestERC721,
} from "../typechain";
import { sha256 } from "ethers/lib/utils";
import Decimal from "../utils/Decimal";
import { BigNumber } from "ethers";

export const THOUSANDTH_MOTIF = ethers.utils.parseUnits(
  "0.001",
  "ether"
) as BigNumber;
export const TENTH_MOTIF = ethers.utils.parseUnits("0.1", "ether") as BigNumber;
export const ONE_MOTIF = ethers.utils.parseUnits("1", "ether") as BigNumber;
export const TWO_MOTIF = ethers.utils.parseUnits("2", "ether") as BigNumber;

export const deployWMOTIF = async () => {
  const [deployer] = await ethers.getSigners();
  return (await (await ethers.getContractFactory("WMOTIF")).deploy()) as WMOTIF;
};

export const deployOtherNFTs = async () => {
  const bad = (await (
    await ethers.getContractFactory("BadERC721")
  ).deploy()) as BadERC721;
  const test = (await (
    await ethers.getContractFactory("TestERC721")
  ).deploy()) as TestERC721;

  return { bad, test };
};

export const deployMotifProtocol = async () => {
  const [deployer] = await ethers.getSigners();
  const itemExchange = await (await new ItemExchangeFactory(deployer).deploy()).deployed();
  const item = await (
    await new ItemFactory(deployer).deploy(itemExchange.address,  "Motif","MOTIF")
  ).deployed();
  await itemExchange.configure(item.address);
  return { itemExchange, item };
};

export const deployBidder = async (listing: string, nftContract: string) => {
  return (await (
    await (await ethers.getContractFactory("BadBidder")).deploy(
      listing,
      nftContract
    )
  ).deployed()) as BadBidder;
};

export const mint = async (item: Item) => {
  const metadataHex = ethers.utils.formatBytes32String("{}");
  const metadataHash = await sha256(metadataHex);
  const hash = ethers.utils.arrayify(metadataHash);
  await item.mint(
    {
      tokenURI: "motif.foundation",
      metadataURI: "motif.foundation",
      contentHash: hash,
      metadataHash: hash,
    },
    {
      prevOwner: Decimal.new(0),
      owner: Decimal.new(85),
      creator: Decimal.new(15),
    }
  );
};

export const approveListing = async (
  item: Item,
  itemListing: ItemListing
) => {
  await item.approve(itemListing.address, 0);
};

export const revert = (messages: TemplateStringsArray) =>
  `VM Exception while processing transaction: revert ${messages[0]}`;
