import React from "react";

export interface FungProps {
    label: string;
}

type FungState = {

}

class FungCanvas extends React.Component<FungProps, FungState> {
    state: FungState = {

    };
    render() {
        return (
            <button>
                a{this.props.label}
            </button>
        );
    }
}

export default FungCanvas;