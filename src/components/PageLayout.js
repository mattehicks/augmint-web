import React from "react";
import { Container, Divider, Header, Segment, Grid } from "semantic-ui-react";

export function Pheader(props) {
    const { children, header, ...other } = props;
    return (
        <Container {...other}>
            <Header as="h1">{header}</Header>
            {children}
            <Divider />
        </Container>
    );
}

Pheader.defaultProps = {
    style: { margin: "1em 0" }
};

export class Psegment extends React.Component {
    render() {
        const { children, ...other } = this.props;
        return <Segment {...other}>{children}</Segment>;
    }
}

Psegment.defaultProps = {
    style: { padding: "2em 2em" },
    vertical: true
};

export class Pgrid extends React.Component {
    render() {
        const { children, ...other } = this.props;
        return <Grid {...other}>{children}</Grid>;
    }
}

Pgrid.defaultProps = {
    stackable: true,
    container: true
};

export class Pcolumn extends React.Component {
    render() {
        const { children, ...other } = this.props;
        return <Grid.Column {...other}>{children}</Grid.Column>;
    }
}

Pgrid.defaultProps = {
    style: {
        paddingBottom: "1em",
        paddingTop: "1em"
    }
};

Pgrid.Column = Pcolumn;
Pgrid.Row = Grid.Row;
