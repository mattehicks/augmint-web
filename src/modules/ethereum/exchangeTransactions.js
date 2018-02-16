import store from "modules/store";
import BigNumber from "bignumber.js";
import { cost } from "./gas";

export const TOKEN_BUY = 0;
export const TOKEN_SELL = 1;
const ONE_ETH = 1000000000000000000;

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
    const bn_decimalsDiv = store.getState().augmintToken.info.bn_decimalsDiv;
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
                    parsed.bn_tokenValue = parsed.bn_amount
                        .mul(parsed.bn_price)
                        .div(ONE_ETH)
                        .round(0, BigNumber.ROUND_DOWN);
                    parsed.bn_weiValue = parsed.bn_amount;
                } else {
                    parsed.orderType = TOKEN_SELL;
                    parsed.bn_tokenValue = parsed.bn_amount;
                    parsed.bn_weiValue = parsed.bn_amount
                        .mul(ONE_ETH)
                        .div(parsed.bn_price)
                        .round(0, BigNumber.ROUND_FLOOR);
                }

                parsed.bn_ethValue = parsed.bn_weiValue.div(ONE_ETH);
                parsed.price = parsed.bn_price.div(bn_decimalsDiv).toString(); // price in tokens/ETH

                parsed.tokenValue = parsed.bn_tokenValue.div(bn_decimalsDiv).toString();
                parsed.ethValue = parsed.bn_ethValue.toString();

                parsed.ethValueRounded = parsed.bn_ethValue.round(6, BigNumber.ROUND_HALF_UP).toString();

                if (orderType === TOKEN_BUY) {
                    parsed.amount = parsed.bn_ethValue.toString();
                    parsed.amountRounded = parsed.bn_ethValue.round(6, BigNumber.ROUND_HALF_UP).toString();
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
    try {
        const gasEstimate = cost.PLACE_ORDER_GAS;
        const userAccount = store.getState().web3Connect.userAccount;
        const exchange = store.getState().exchange.contract.instance;
        let submitAmount, result;

        switch (orderType) {
            case TOKEN_BUY:
                submitAmount = amount.mul(ONE_ETH).toString();
                result = await exchange.placeBuyTokenOrder(price * 10000, {
                    value: submitAmount,
                    from: userAccount,
                    gas: gasEstimate
                });
                break;
            case TOKEN_SELL:
                const augmintToken = store.getState().augmintToken;
                submitAmount = amount.mul(augmintToken.info.bn_decimalsDiv).toString();
                result = await augmintToken.contract.instance.transferAndNotify(
                    exchange.address,
                    submitAmount,
                    price.mul(augmintToken.info.bn_decimalsDiv),
                    {
                        from: userAccount,
                        gas: gasEstimate
                    }
                );
                break;
            default:
                throw new Error("Unknown orderType: " + orderType);
        }

        if (result.receipt.gasUsed === gasEstimate) {
            // Neeed for testnet behaviour (TODO: test it!)
            // TODO: add more tx info
            throw new Error("Place order failed. All gas provided was used:  " + result.receipt.gasUsed);
        }

        if (
            !result.logs ||
            !result.logs[0] ||
            (result.logs[0].event !== "NewOrder" && result.logs[1].event !== "AugmintTransfer")
        ) {
            const error = new Error("NewOrder or Augmint transfer event wasn't received. Check tx :  " + result.tx);
            console.error(error, "\nResult received:", result);
            throw error;
        }

        return {
            txResult: result,
            eth: {
                gasProvided: gasEstimate,
                gasUsed: result.receipt.gasUsed,
                tx: result.tx
            }
        };
    } catch (error) {
        console.error("Place order failed.\n", error);
        throw new Error("Place order failed.\n" + error);
    }
}

export async function matchOrdersTx(buyIndex, buyId, sellIndex, sellId) {
    try {
        const gasEstimate = cost.MATCH_ORDERS_GAS;
        const userAccount = store.getState().web3Connect.userAccount;
        const exchange = store.getState().exchange.contract.instance;

        const result = await exchange.matchOrders(buyIndex, buyId, sellIndex, sellId, {
            from: userAccount,
            gas: gasEstimate
        });

        if (result.receipt.gasUsed === gasEstimate) {
            // Neeed for testnet behaviour (TODO: test it!)
            // TODO: add more tx info
            throw new Error("Match orders failed. All gas provided was used:  " + result.receipt.gasUsed);
        }

        if (!result.logs || !result.logs[0] || result.logs[0].event !== "OrderFill") {
            const error = new Error("OrderFill event wasn't received. Check tx :  " + result.tx);
            console.error(error, "\nResult received:", result);
            throw error;
        }

        return {
            txResult: result,
            eth: {
                gasProvided: gasEstimate,
                gasUsed: result.receipt.gasUsed,
                tx: result.tx
            }
        };
    } catch (error) {
        console.error("Order matching failed.\n", error);
        throw new Error("Order matching failed.\n" + error);
    }
}

export async function cancelOrderTx(orderType, orderIndex, orderId) {
    try {
        const gasEstimate = cost.CANCEL_ORDER_GAS;
        const userAccount = store.getState().web3Connect.userAccount;
        const exchange = store.getState().exchange.contract.instance;

        // return {
        //     txResult: "mock",
        //     eth: {
        //         gasProvided: gasEstimate,
        //         gasUsed: 99999,
        //         tx: "tx mock"
        //     }
        // };

        let result;
        if (orderType === TOKEN_BUY) {
            result = await exchange.cancelBuyTokenOrder(orderIndex, orderId, {
                from: userAccount,
                gas: gasEstimate
            });
        } else if (orderType === TOKEN_SELL) {
            result = await exchange.cancelSellTokenOrder(orderIndex, orderId, {
                from: userAccount,
                gas: gasEstimate
            });
        } else {
            throw new Error("Cancel order failed, invalid orderType: " + orderType);
        }

        if (result.receipt.gasUsed === gasEstimate) {
            // Neeed for testnet behaviour
            // TODO: add more tx info
            throw new Error("Cancel orders failed. All gas provided was used:  " + result.receipt.gasUsed);
        }

        if (!result.logs || !result.logs[0] || result.logs[0].event !== "CancelledOrder") {
            const error = new Error("CancelledOrder event wasn't received. Check tx :  " + result.tx);
            console.error(error, "\nResult received:", result);
            throw error;
        }

        return {
            txResult: result,
            eth: {
                gasProvided: gasEstimate,
                gasUsed: result.receipt.gasUsed,
                tx: result.tx
            }
        };
    } catch (error) {
        console.error("Cancel order failed.\n", error);
        throw new Error("Cancel order failed.\n" + error);
    }
}
