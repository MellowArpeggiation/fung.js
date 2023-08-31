import React from "react";

export interface FungProps {
    label: string;
}

const FungCanvas = (props: FungProps) => {
    return <button>{props.label}</button>;
};

export default FungCanvas;