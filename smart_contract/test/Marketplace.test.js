const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Marketplace flow", function () {
    let rtb;
    let marketplace;
    let usdc;
    let treasury;
    let seller;
    let buyer;
    let operator;

    beforeEach(async function () {
        [deployer, treasury, seller, buyer, operator] = await ethers.getSigners();

        const FIFARTB = await ethers.getContractFactory("FIFARTB");
        rtb = await FIFARTB.deploy();
        await rtb.waitForDeployment();

        await rtb.grantRole(await rtb.OPERATOR_ROLE(), operator.address);
        await rtb.connect(operator).mintRTB(seller.address, "WC26-FINAL");

        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDC.deploy();
        await usdc.waitForDeployment();

        const Marketplace = await ethers.getContractFactory("Marketplace");
        marketplace = await Marketplace.deploy(await rtb.getAddress(), await usdc.getAddress(), treasury.address);
        await marketplace.waitForDeployment();

        await rtb.connect(seller).approve(await marketplace.getAddress(), 1);

        const tx = await marketplace.connect(seller).listRTB(1, ethers.parseUnits("100", 6));
        await tx.wait();

        await usdc.mint(buyer.address, ethers.parseUnits("100", 6));
        await usdc.connect(buyer).approve(await marketplace.getAddress(), ethers.parseUnits("100", 6));
    });

    it("escrows RTB, splits USDC 85/15, and transfers token to buyer in one atomic flow", async function () {
        const listingId = 1n;

        await marketplace.connect(buyer).buyRTB(listingId);

        expect(await rtb.ownerOf(1)).to.equal(buyer.address);
        expect(await usdc.balanceOf(seller.address)).to.equal(ethers.parseUnits("85", 6));
        expect(await usdc.balanceOf(treasury.address)).to.equal(ethers.parseUnits("15", 6));
        const listing = await marketplace.listings(listingId);
        expect(listing.status).to.equal(2); // SOLD
    });
});
