// @ts-ignore
import { ethers } from "hardhat";
import fs from "fs-extra";
import { ItemListing } from "../typechain"; 
import { AvatarListing } from "../typechain";
import { SpaceListing } from "../typechain";
import { LandListing } from "../typechain";

async function main() {
  const args = require("minimist")(process.argv.slice(2));

  if (!args.chainId) {
    throw new Error("--chainId chain ID is required");
  }
  const path = `${process.cwd()}/.env.prod`;
  await require("dotenv").config({ path });
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_ENDPOINT
  );
  const wallet = new ethers.Wallet(`0x${process.env.PRIVATE_KEY}`, provider);
  const addressPath = `${process.cwd()}/addresses/${args.chainId}.json`;
  const protocolAddressPath = `${process.cwd()}/node_modules/@motif-foundation/asset/dist/addresses/${
    args.chainId
  }.json`;

  // @ts-ignore
  const addressBook = JSON.parse(await fs.readFileSync(addressPath));
  const protocolAddressBook = JSON.parse(
    // @ts-ignore
    await fs.readFileSync(protocolAddressPath)
  );

  if (!addressBook.wmotif) {
    throw new Error("Missing WMOTIF address in address book.");
  }
  // if (!protocolAddressBook.item) {
  //   throw new Error("Missing Item address in protocol address book.");
  // }
  // if (addressBook.itemListing) {
  //   throw new Error(
  //     "itemListing already in address book, it must be moved before deploying."
  //   );
  // }

  // We get the contract to deploy
  const ItemListing = (await ethers.getContractFactory(
    "ItemListing",
    wallet
  )) as ItemListing;

  console.log(
    `Deploying Item Listing from deployment address ${wallet.address}...`
  );
  const impl = await ItemListing.deploy(
    protocolAddressBook.item,
    addressBook.wmotif,
    "8107"
  );
  console.log(
    `Item Listing deploying to ${impl.address}. Awaiting confirmation...`
  );
  await impl.deployed();
  addressBook.itemListing = impl.address;
  await fs.writeFile(addressPath, JSON.stringify(addressBook, null, 2));

  console.log("Item Listing contracts deployed 📿");



  //Space
  if (!protocolAddressBook.space) {
    throw new Error("Missing Space address in protocol address book.");
  }
  if (addressBook.spaceListing) {
    throw new Error(
      "spaceListing already in address book, it must be moved before deploying."
    );
  }
  const SpaceListing = (await ethers.getContractFactory(
    "SpaceListing",
    wallet
  )) as SpaceListing;
  console.log(
    `Deploying SpaceListing from deployment address ${wallet.address}...`
  );
  const implSpace = await SpaceListing.deploy(
    protocolAddressBook.space,
    addressBook.wmotif 
  );
  console.log(
    `SpaceListing deploying to ${implSpace.address}. Awaiting confirmation...`
  );
  await implSpace.deployed();
  addressBook.spaceListing = implSpace.address;
  await fs.writeFile(addressPath, JSON.stringify(addressBook, null, 2));
  console.log("SpaceListing contracts deployed");

  //Avatar
  if (!protocolAddressBook.avatar) {
    throw new Error("Missing Avatar address in protocol address book.");
  }
  if (addressBook.avatarListing) {
    throw new Error(
      "avatarListing already in address book, it must be moved before deploying."
    );
  }
  const AvatarListing = (await ethers.getContractFactory(
    "AvatarListing",
    wallet
  )) as AvatarListing;
  console.log(
    `Deploying AvatarListing from deployment address ${wallet.address}...`
  );
  const implAvatar = await AvatarListing.deploy(
    protocolAddressBook.avatar,
    addressBook.wmotif 
  );
  console.log(
    `AvatarListing deploying to ${implAvatar.address}. Awaiting confirmation...`
  );
  await implAvatar.deployed();
  addressBook.avatarListing = implAvatar.address;
  await fs.writeFile(addressPath, JSON.stringify(addressBook, null, 2));
  console.log("AvatarListing contracts deployed");

  //Land
  if (!protocolAddressBook.land) {
    throw new Error("Missing Land address in protocol address book.");
  }
  if (addressBook.landListing) {
    throw new Error(
      "landListing already in address book, it must be moved before deploying."
    );
  }
  const LandListing = (await ethers.getContractFactory(
    "LandListing",
    wallet
  )) as LandListing;
  console.log(
    `Deploying LandListing from deployment address ${wallet.address}...`
  );
  const implLand = await LandListing.deploy(
    protocolAddressBook.land,
    addressBook.wmotif 
  );
  console.log(
    `LandListing deploying to ${implLand.address}. Awaiting confirmation...`
  );
  await implLand.deployed();
  addressBook.landListing = implLand.address;
  await fs.writeFile(addressPath, JSON.stringify(addressBook, null, 2));
  console.log("LandListing contracts deployed");
 

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
