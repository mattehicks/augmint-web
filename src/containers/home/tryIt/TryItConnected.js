import React from "react";

import { Tsegment, Tblock } from "components/TextContent";
import { Link } from "react-router-dom";
import { EthereumState } from "containers/app/EthereumState";
import { SuccessPanel } from "components/MsgPanels";
import { DiscordButton } from "components/LinkButtons";

export function TryItConnected(props) {
    return (
        <EthereumState>
            <Tsegment>
                <SuccessPanel data-testid="TryItConnectedPanel" header="Great! You are connected" />

                <Tblock header="Get some test ETH">
                    <p>
                        Use{" "}
                        <Link target="_blank" to="https://faucet.rinkeby.io/">
                            faucet.rinkeby.io
                        </Link>
                    </p>
                    <p>
                        If you can't be bothered ask for some{" "}
                        <Link target="_blank" to="https://discord.gg/PwDmsnu">
                            on our discord channel
                        </Link>
                    </p>
                </Tblock>

                <Tblock header="Get A-EUR">
                    <p>
                        <Link to="/loan/new">Get a loan</Link> by leaving your ETH in escrow
                    </p>
                    <p>
                        Buy A-EUR on <Link to="/exchange">Augmint's exchange</Link>
                    </p>
                </Tblock>

                <Tblock header="Play around">
                    <p>
                        See your loans, transactions and transfer A-EUR from your <Link to="/account">account</Link>
                    </p>
                    <p>
                        Check the <Link to="/reserves">Augmint reserves</Link>
                    </p>
                </Tblock>
                <Tsegment.Row columns={1}>
                    <Tsegment.Column>
                        <DiscordButton />
                    </Tsegment.Column>
                </Tsegment.Row>
            </Tsegment>
        </EthereumState>
    );
}
