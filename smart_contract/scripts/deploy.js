require("dotenv").config();

async function main() {

    const [deployer] = await ethers.getSigners();

    console.log("--------------------------------");
    console.log("Deploy wallet:", deployer.address);
    console.log("--------------------------------");


    // ==========================
    // Deploy FIFARTB
    // ==========================

    console.log("Deploying FIFARTB...");

    const RTBFactory = await ethers.getContractFactory(
        "FIFARTB"
    );

    const rtb = await RTBFactory.deploy({
    gasLimit: 3000000n
    });

    await rtb.waitForDeployment();

    const rtbAddress = await rtb.getAddress();


    console.log(
        "FIFARTB deployed:",
        rtbAddress
    );


    // ==========================
    // Deploy FIFARTT
    // ==========================

    console.log("Deploying FIFARTT...");


    const RTTFactory = await ethers.getContractFactory(
        "FIFARTT"
    );


    const rtt = await RTTFactory.deploy(
    deployer.address,
    rtbAddress,
    {
        gasLimit: 3000000n
    }
    );


    await rtt.waitForDeployment();


    const rttAddress = await rtt.getAddress();


    console.log(
        "FIFARTT deployed:",
        rttAddress
    );



    // ==========================
    // Link RTB -> RTT
    // ==========================


    console.log(
        "Linking RTB with RTT..."
    );


    const tx = await rtb.setRTTContract(
        rttAddress,
        {
            gasLimit: 500000n
        }
    );

    await tx.wait();


    console.log(
        "RTB linked successfully"
    );



    // ==========================
    // Grant OPERATOR_ROLE
    // cho Backend
    // ==========================


    if(process.env.BACKEND_WALLET){

        console.log(
            "Grant OPERATOR_ROLE..."
        );


        const OPERATOR_ROLE =
            await rtb.OPERATOR_ROLE();


        const grantTx =
            await rtb.grantRole(
                OPERATOR_ROLE,
                process.env.BACKEND_WALLET,
                {
                    gasLimit: 500000n
                }
            );


        await grantTx.wait();


        console.log(
            "Backend wallet granted OPERATOR_ROLE"
        );

    }
    else {

        console.log(
            "BACKEND_WALLET missing, skip role"
        );

    }



    // ==========================
    // Deploy FIFARTBMarketplace
    // ==========================

    console.log("Deploying FIFARTBMarketplace...");

    const MarketplaceFactory = await ethers.getContractFactory(
        "FIFARTBMarketplace"
    );

    const treasuryWallet = process.env.PAYMENT_WALLET || deployer.address;
    const usdcAddress = process.env.USDC_ADDRESS;

    if (!usdcAddress) {
        throw new Error("USDC_ADDRESS not configured in .env");
    }

    const marketplace = await MarketplaceFactory.deploy(
        rtbAddress,
        usdcAddress,
        treasuryWallet,
        {
            gasLimit: 3000000n
        }
    );

    await marketplace.waitForDeployment();

    const marketplaceAddress = await marketplace.getAddress();

    console.log(
        "FIFARTBMarketplace deployed:",
        marketplaceAddress
    );


    // ==========================
    // Set Marketplace as approved
    // ==========================

    console.log("Setting marketplace as approved operator...");

    const setMarketplaceTx = await rtb.setApprovedMarketplace(
        marketplaceAddress,
        {
            gasLimit: 500000n
        }
    );

    await setMarketplaceTx.wait();

    console.log("Marketplace set as approved operator");


    // ==========================
    // Save address to .env files
    // ==========================


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


    upsertEnvValue(
        path.resolve(__dirname, "../.env"),
        "RTB_ADDRESS",
        rtbAddress
    );

    upsertEnvValue(
        path.resolve(__dirname, "../.env"),
        "RTT_ADDRESS",
        rttAddress
    );

    upsertEnvValue(
        path.resolve(__dirname, "../.env"),
        "MARKETPLACE_ADDRESS",
        marketplaceAddress
    );

    upsertEnvValue(
        path.resolve(__dirname, "../../backend/.env"),
        "RTB_ADDRESS",
        rtbAddress
    );

    upsertEnvValue(
        path.resolve(__dirname, "../../backend/.env"),
        "RTT_ADDRESS",
        rttAddress
    );

    upsertEnvValue(
        path.resolve(__dirname, "../../backend/.env"),
        "MARKETPLACE_ADDRESS",
        marketplaceAddress
    );

    upsertEnvValue(
        path.resolve(__dirname, "../../frontend/.env"),
        "VITE_RTB_ADDRESS",
        rtbAddress
    );

    upsertEnvValue(
        path.resolve(__dirname, "../../frontend/.env"),
        "VITE_RTT_ADDRESS",
        rttAddress
    );

    upsertEnvValue(
        path.resolve(__dirname, "../../frontend/.env"),
        "VITE_MARKETPLACE_ADDRESS",
        marketplaceAddress
    );


    console.log("--------------------------------");
    console.log("DEPLOY FINISHED");
    console.log("RTB:", rtbAddress);
    console.log("RTT:", rttAddress);
    console.log("Marketplace:", marketplaceAddress);
    console.log("--------------------------------");

}



main()
.then(() => process.exit(0))
.catch((error)=>{

    console.error(error);

    process.exit(1);

});