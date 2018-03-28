import store from "modules/store";
import BigNumber from "bignumber.js";
import { cost } from "./gas";
import { EthereumTransactionError, processTx } from "modules/ethereum/ethHelper";

import { ONE_ETH_IN_WEI } from "utils/constants";

export const TOKEN_BUY = 0;
export const TOKEN_SELL = 1;

export async function fetchOrders() {
    // TODO: handle when order changes while iterating
    const exchange = store.getState().exchange;

    const orderCounts = await exchange.contract.instance.getActiveOrderCounts();
    const buyCount = orderCounts[0].toNumber();
    const sellCount = orderCounts[1].toNumber();
    // retreive all orders
    let buyOrders = [];
    let queryCount = Math.ceil(buyCount / exchange.info.chunkSize);
    for (let i = 0; i < queryCount; i++) {
        const fetchedOrders = await getOrders(TOKEN_BUY, i * exchange.info.chunkSize);
        buyOrders = buyOrders.concat(fetchedOrders.buyOrders);
    }

    let sellOrders = [];
    queryCount = Math.ceil(sellCount / exchange.info.chunkSize);
    for (let i = 0; i < queryCount; i++) {
        const fetchedOrders = await getOrders(TOKEN_SELL, i * exchange.info.chunkSize);
        sellOrders = sellOrders.concat(fetchedOrders.sellOrders);
    }

    return { buyOrders: buyOrders, sellOrders: sellOrders };
}

async function getOrders(orderType, offset) {
    const exchange = store.getState().exchange.contract.instance;
    const decimalsDiv = store.getState().augmintToken.info.decimalsDiv;
    const decimals = store.getState().augmintToken.info.decimals;
    const blockGasLimit = Math.floor(store.getState().web3Connect.info.gasLimit * 0.9); // gasLimit was read at connection time, prepare for some variance

    let result;
    if (orderType === TOKEN_BUY) {
        result = await exchange.getActiveBuyOrders(offset, { gas: blockGasLimit });
    } else {
        result = await exchange.getActiveSellOrders(offset, { gas: blockGasLimit });
    }

    // result format: [id, maker,  price, amount]
    const orders = result.reduce(
        (res, order, idx) => {
            if (!order[3].eq(0)) {
                const parsed = {
                    id: order[0].toNumber(),
                    maker: "0x" + order[1].toString(16), // ethers.utils.hexlify(order[1].toString(16)),
                    bn_price: order[2],
                    bn_amount: order[3]
                };

                if (orderType === TOKEN_BUY) {
                    parsed.orderType = TOKEN_BUY;
                    parsed.tokenValue = parseFloat(
                        parsed.bn_amount
                            .mul(parsed.bn_price)
                            .div(ONE_ETH_IN_WEI)
                            .round(0, BigNumber.ROUND_HALF_DOWN)
                            .div(decimalsDiv)
                            .toFixed(decimals)
                    );
                    parsed.bn_weiValue = parsed.bn_amount;
                } else {
                    parsed.orderType = TOKEN_SELL;
                    parsed.tokenValue = parseFloat(parsed.bn_amount / decimalsDiv);
                    parsed.bn_weiValue = parsed.bn_amount
                        .mul(ONE_ETH_IN_WEI)
                        .div(parsed.bn_price)
                        .round(0, BigNumber.ROUND_HALF_UP);
                }

                parsed.price = parsed.bn_price / decimalsDiv; // price in tokens/ETH
                parsed.bn_ethValue = parsed.bn_weiValue.div(ONE_ETH_IN_WEI);
                parsed.ethValue = parsed.bn_ethValue.toString();
                parsed.ethValueRounded = parseFloat(parsed.bn_ethValue.toFixed(6));

                if (orderType === TOKEN_BUY) {
                    parsed.amount = parsed.ethValue;
                    parsed.amountRounded = parsed.ethValueRounded;
                    res.buyOrders.push(parsed);
                } else {
                    parsed.amount = parsed.tokenValue;
                    parsed.amountRounded = parsed.tokenValue;
                    res.sellOrders.push(parsed);
                }
            }
            return res;
        },
        { buyOrders: [], sellOrders: [] }
    );

    orders.buyOrders.sort((o1, o2) => isOrderBetter(o1, o2));
    orders.sellOrders.sort((o1, o2) => isOrderBetter(o1, o2));
    return orders;
}

export function isOrderBetter(o1, o2) {
    if (o1.orderType !== o2.orderType) {
        throw new Error("isOrderBetter(): ordertypes must be the same" + o1 + o2);
    }

    const dir = o1.orderType === TOKEN_SELL ? 1 : -1;
    return o1.price * dir > o2.price * dir || (o1.price === o2.price && o1.id > o2.id);
}

export async function placeOrderTx(orderType, amount, price) {
    const gasEstimate = cost.PLACE_ORDER_GAS;
    const userAccount = store.getState().web3Connect.userAccount;
    const exchange = store.getState().exchange.contract.web3ContractInstance;
    const decimalsDiv = store.getState().augmintToken.info.decimalsDiv;

    const submitPrice = new BigNumber(price).mul(decimalsDiv);
    let submitAmount;
    let tx;
    let txName;

    switch (orderType) {
        case TOKEN_BUY:
            submitAmount = new BigNumber(amount).mul(ONE_ETH_IN_WEI);
            txName = "Buy token order";
            tx = exchange.methods.placeBuyTokenOrder(submitPrice.toString()).send({
                value: submitAmount,
                from: userAccount,
                gas: gasEstimate
            });
            break;

        case TOKEN_SELL:
            const augmintToken = store.getState().augmintToken.contract.web3ContractInstance;
            submitAmount = new BigNumber(amount).mul(decimalsDiv);
            txName = "Sell token order";
            tx = augmintToken.methods
                .transferAndNotify(exchange._address, submitAmount.toString(), submitPrice.toString())
                .send({ from: userAccount, gas: gasEstimate });
            break;

        default:
            throw new EthereumTransactionError(
                "Place order failed.",
                "Unknown orderType: " + orderType,
                null,
                gasEstimate
            );
    }

    let onReceipt;
    if (orderType === TOKEN_SELL) {
        // tokenSell is called on AugmintToken and event emmitted from Exchange is not parsed by web3
        onReceipt = receipt => {
            const exchange = store.getState().exchange.contract.web3ContractInstance;
            const web3 = store.getState().web3Connect.web3Instance;
            const newOrderEventInputs = exchange.options.jsonInterface.find(val => val.name === "NewOrder").inputs;

            const decodedArgs = web3.eth.abi.decodeLog(
                newOrderEventInputs,
                receipt.events[0].raw.data,
                receipt.events[0].raw.topics.slice(1) // topics[0] is event name
            );
            receipt.events.NewOrder = receipt.events[0];
            receipt.events.NewOrder.returnValues = decodedArgs;
            return { orderId: decodedArgs.orderId };
        };
    }

    const transactionHash = await processTx(tx, txName, gasEstimate, onReceipt);

    return { txName, transactionHash };
}

export async function matchOrdersTx(buyId, sellId) {
    const txName = "Match orders";
    const gasEstimate = cost.MATCH_ORDERS_GAS;
    const userAccount = store.getState().web3Connect.userAccount;
    const exchange = store.getState().exchange.contract.web3ContractInstance;

    const tx = exchange.methods.matchOrders(buyId, sellId).send({ from: userAccount, gas: gasEstimate });

    const transactionHash = await processTx(tx, txName, gasEstimate);

    return { txName, transactionHash };
}

export async function cancelOrderTx(orderType, orderId) {
    const gasEstimate = cost.CANCEL_ORDER_GAS;
    const userAccount = store.getState().web3Connect.userAccount;
    const exchange = store.getState().exchange.contract.web3ContractInstance;

    let tx;
    let txName;
    if (orderType === TOKEN_BUY) {
        tx = exchange.methods.cancelBuyTokenOrder(orderId).send({ from: userAccount, gas: gasEstimate });
        txName = "Cancel buy order";
    } else if (orderType === TOKEN_SELL) {
        tx = exchange.methods.cancelSellTokenOrder(orderId).send({ from: userAccount, gas: gasEstimate });
        txName = "Cancel sell order";
    } else {
        throw new EthereumTransactionError("Order cancel error.", "invalid orderType: " + orderType, null, gasEstimate);
    }

    const transactionHash = await processTx(tx, txName, gasEstimate);

    return { txName, transactionHash };
}
