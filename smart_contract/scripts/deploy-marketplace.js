require("dotenv").config();

async function main() {
    const [deployer] = await ethers.getSigners();

    const rtbAddress = process.env.RTB_ADDRESS || "0x6e85C7Ce7B851AFdEC331a4e214427B4eD4a1B94";
    const usdcAddress = process.env.USDC_ADDRESS || "0x5425890298aed601595a70AB815c96711a31Bc65";
    const treasuryAddress = process.env.PAYMENT_WALLET || deployer.address;

    console.log("--------------------------------");
    console.log("Deploy wallet:", deployer.address);
    console.log("RTB:", rtbAddress);
    console.log("USDC:", usdcAddress);
    console.log("Treasury:", treasuryAddress);
    console.log("--------------------------------");

    const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
    const marketplace = await MarketplaceFactory.deploy(rtbAddress, usdcAddress, treasuryAddress, {
        gasLimit: 3000000n
    });

    await marketplace.waitForDeployment();
    const marketplaceAddress = await marketplace.getAddress();

    const fs = require("fs");
    const path = require("path");

    function upsertEnvValue(filePath, key, value) {
        const resolvedPath = path.resolve(filePath);
        let content = "";

        if (fs.existsSync(resolvedPath)) {
            content = fs.readFileSync(resolvedPath, "utf8");
        }

        const regex = new RegExp(`^${key}=.*$`, "m");

        if (regex.test(content)) {
            content = content.replace(regex, `${key}=${value}`);
        } else {
            const trimmed = content.trimEnd();
            content = trimmed ? `${trimmed}\n${key}=${value}\n` : `${key}=${value}\n`;
        }

        fs.writeFileSync(resolvedPath, content);
    }

    upsertEnvValue(path.resolve(__dirname, "../.env"), "MARKETPLACE_ADDRESS", marketplaceAddress);
    upsertEnvValue(path.resolve(__dirname, "../../backend/.env"), "MARKETPLACE_ADDRESS", marketplaceAddress);
    upsertEnvValue(path.resolve(__dirname, "../../frontend/.env"), "VITE_MARKETPLACE_ADDRESS", marketplaceAddress);

    console.log("--------------------------------");
    console.log("Marketplace deployed:", marketplaceAddress);
    console.log("--------------------------------");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
