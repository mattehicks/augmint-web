/*
    TODO: use BigNumber for conversions
    TODO: add RATES_REFRESH_ERROR
    */
import store from "store.js";
import SolidityContract from "./SolidityContract";
import rates_artifacts from "contractsBuild/Rates.json";
import { asyncGetBalance, getUcdBalance } from "./ethHelper";

export const RATES_CONNECT_REQUESTED = "ethBase/RATES_CONNECT_REQUESTED";
export const RATES_CONNECT_SUCCESS = "ethBase/RATES_CONNECT_SUCCESS";
export const RATES_CONNECT_ERROR = "ethBase/RATES_CONNECT_ERROR";

export const RATES_REFRESH_REQUESTED = "ethBase/RATES_REFRESH_REQUESTED";
export const RATES_REFRESHED = "ethBase/RATES_REFRESHED";

const initialState = {
    contract: null,
    error: null,
    connectionError: null,
    isLoading: true,
    isConnected: false,
    ethBalance: "?",
    ucdBalance: "?",
    owner: "?",
    usdWeiRate: null
};

export default (state = initialState, action) => {
    switch (action.type) {
        case RATES_CONNECT_REQUESTED:
            return {
                ...state,
                isLoading: true,
                connectionError: null,
                error: null
            };

        case RATES_CONNECT_SUCCESS:
            return {
                ...state,
                contract: action.contract,
                isLoading: false,
                isConnected: true,
                connectionError: null,
                error: null
            };

        case RATES_CONNECT_ERROR:
            return {
                ...state,
                isLoading: false,
                isConnected: false,
                connectionError: action.error
            };

        case RATES_REFRESH_REQUESTED:
            return {
                ...state
            };

        case RATES_REFRESHED:
            return {
                ...state,
                ethBalance: action.ethBalance,
                ucdBalance: action.ucdBalance,
                owner: action.owner,
                usdcWeiRate: action.usdcWeiRate,
                usdEthRate: action.usdEthRate,
                ethUsdRate: action.ethUsdRate
            };

        default:
            return state;
    }
};

export const connectRates = () => {
    return async dispatch => {
        dispatch({
            type: RATES_CONNECT_REQUESTED
        });
        try {
            return dispatch({
                type: RATES_CONNECT_SUCCESS,
                contract: await SolidityContract.connectNew(
                    store.getState().ethBase.web3Instance.currentProvider,
                    rates_artifacts
                )
            });
        } catch (error) {
            return dispatch({
                type: RATES_CONNECT_ERROR,
                error: error
            });
        }
    };
};

export const refreshRates = () => {
    return async dispatch => {
        dispatch({
            type: RATES_REFRESH_REQUESTED
        });
        let web3 = store.getState().ethBase.web3Instance;
        let rates = store.getState().rates.contract.instance;
        let usdDecimalsMul = 10 ** (await rates.decimals()).toNumber();
        let usdcWeiRate = (await rates.usdWeiRate()).toNumber();
        // let weiUsdcRate = 1/usdcWeiRate;
        let usdcEthRate = web3.fromWei(usdcWeiRate);
        let usdEthRate = usdcEthRate * usdDecimalsMul;
        let ethUsdcRate = 1 / usdcEthRate;
        let ethUsdRate = ethUsdcRate / usdDecimalsMul;
        let owner = await rates.owner();

        let ethBalance = await asyncGetBalance(rates.address);
        let ucdBalance = await getUcdBalance(rates.address);
        return dispatch({
            type: RATES_REFRESHED,
            ethBalance: ethBalance,
            ucdBalance: ucdBalance,
            usdcWeiRate: usdcWeiRate,
            usdEthRate: usdEthRate,
            ethUsdRate: ethUsdRate,
            owner: owner
        });
    };
};
