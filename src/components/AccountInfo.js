import React from "react";
import { connect } from "react-redux";
import { Pblock } from "components/PageLayout";
import { Link } from "react-router-dom";
import { ConnectionStatus } from "components/MsgPanels";

export class AccountInfo extends React.Component {
    render() {
        const { header, showMyAccountLink, account, augmintToken, userBalancesIsLoading } = this.props;
        return (
            <Pblock
                data-testid="accountInfoBlock"
                className="accountInfo"
                loading={
                    augmintToken.isLoading ||
                    (!augmintToken.isLoaded && !augmintToken.loadError) ||
                    userBalancesIsLoading
                }
                header={header}
            >
                <ConnectionStatus contract={augmintToken} />

                <p>Account: {account.address}</p>
                <p>
                    ETH: <span data-testid="userEthBalance">{account.ethBalance}</span>
                </p>
                <p>
                    A-EUR: <span data-testid="userAEurBalance">{account.tokenBalance}</span>
                </p>
                {showMyAccountLink && <Link to="/account">More details</Link>}
            </Pblock>
        );
    }
}

AccountInfo.defaultProps = {
    header: "My Account",
    showMyAccountLink: false
};

const mapStateToProps = state => ({
    userBalancesIsLoading: state.userBalances.isLoading,
    augmintToken: state.augmintToken
});

export default connect(mapStateToProps)(AccountInfo);
