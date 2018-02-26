export const cost = {
    NEW_LOAN_GAS: 180000, // As of now it's on ganache: 167,196-167390
    NEW_FIRST_LOAN_GAS: 240000, // 227390
    REPAY_GAS: 120000, // AugmintToken.transferAndNotify, as of now on testRpc: first: 105,354
    COLLECT_BASE_GAS: 90000, // as of now on testRpc: 1 loan = first: 73,333, consecutive:  64,683
    COLLECT_ONE_GAS: 20000, // as of now: ca. 10000

    TRANSFER_AUGMINT_TOKEN_GAS: 100000, // on testrpc: first: 75189 - 75405, rinkeby first: 76629
    //consecutive : no narr: 45405 - 60405 (higher when sent to account which never received)
    // w narrative: 46733 - 56693

    PLACE_ORDER_GAS: 250000,
    MATCH_ORDERS_GAS: 200000,
    CANCEL_ORDER_GAS: 150000
};
