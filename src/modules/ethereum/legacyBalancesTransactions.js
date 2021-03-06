import store from "modules/store";
import BigNumber from "bignumber.js";
import { cost } from "./gas";
import { processTx } from "modules/ethereum/ethHelper";
import SolidityContract from "modules/ethereum/SolidityContract";
import { DECIMALS_DIV } from "utils/constants";

/* List of old augmint token deploy addresses by network id */
const ACCEPTED_LEGACY_AEUR_CONTRACTS = {
    // mainnet (no deploy yet)
    1: [],

    // local ganache (migrations deploys it for manual testing)
    999: ["0x5d77f09a3703be84d84810379067a6d9ad759582"],

    // rinkeby
    4: [
        "0xA35D9de06895a3A2E7eCaE26654b88Fe71C179eA", //https://github.com/Augmint/augmint-web/commit/1f66ee910f5186c38733e1196ac5d41260490d24
        "0x95aa79d7410eb60f49bfd570b445836d402bd7b1",
        "0x135893f1a6b3037bb45182841f18f69327366992"
    ]
};

export async function fetchLegacyBalances() {
    const web3 = store.getState().web3Connect;
    const legacyTokenAddresses = ACCEPTED_LEGACY_AEUR_CONTRACTS[web3.network.id];
    const userAccount = store.getState().web3Connect.userAccount;

    const queryTxs = legacyTokenAddresses.map(address => {
        const legacyContract = SolidityContract.connectAt(web3, "TokenAEur", address);
        return legacyContract.web3ContractInstance.methods.balanceOf(userAccount).call();
    });

    const legacyBalances = await Promise.all(queryTxs);
    const ret = legacyBalances.map((bn_balance, i) => ({
        contract: legacyTokenAddresses[i],
        bn_balance,
        balance: bn_balance / DECIMALS_DIV
    }));

    return ret;
}

export async function convertLegacyBalanceTx(legacyTokenAddress, amount) {
    const txName = "Convert legacy balance";
    const web3 = store.getState().web3Connect;
    const monetarySupervisorAddress = store.getState().contracts.latest.monetarySupervisor.address;
    const gasEstimate = cost.LEGACY_BALANCE_CONVERT_GAS;
    const userAccount = store.getState().web3Connect.userAccount;

    const legacyContract = SolidityContract.connectAt(web3, "TokenAEur", legacyTokenAddress);

    const tx = legacyContract.web3ContractInstance.methods
        .transferAndNotify(monetarySupervisorAddress, new BigNumber(amount).mul(DECIMALS_DIV).toString(), 0)
        .send({
            from: userAccount,
            gas: gasEstimate
        });

    const transactionHash = await processTx(tx, txName, gasEstimate);
    return { txName, transactionHash };
}
