import React from "react";
import { render } from "react-dom";
import { Provider } from "react-redux";
import { ConnectedRouter } from "react-router-redux";
import store, { history } from "modules/store";
import App from "./containers/app";

it("renders without crashing", () => {
    const target = document.createElement("div");
    render(
        <Provider store={store}>
            <ConnectedRouter history={history}>
                <div>
                    <App />
                </div>
            </ConnectedRouter>
        </Provider>,
        target
    );
});
