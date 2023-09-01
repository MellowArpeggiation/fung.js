import * as React from "react"
import { useState, useEffect } from "react"
import { FungCanvas } from "../components"

const FungContainer = () => {
    let [fromColor, setFromColor] = useState("magenta");
    let [toColor, setToColor] = useState("cyan");

    let [turnSpeed, setTurnSpeed] = useState(12);
    let [diffusionRate, setDiffusionRate] = useState(30);

    let [width, setWidth] = useState(640);
    let [portrait, setPortrait] = useState(false);

    useEffect(() => {
        const lastTime = 0;
        const render = (time: number) => {
            time *= 0.001;
            
            setFromColor("hsl(" + time * 360 * 0.01 % 360 + ", 100%, 50%)");
            setToColor("hsl(" + time * 360 * 0.045 % 360 + ", 100%, 50%)");

            setTurnSpeed((Math.sin(time * 0.5) + 1) * 12)
            setDiffusionRate((Math.sin(time * 0.71) + 1) * 30);

            requestAnimationFrame(render);
        };

        requestAnimationFrame(render);
    }, []);

    return (
        <main className="container">
            <FungCanvas
                fromColor={fromColor}
                toColor={toColor}
                turnSpeed={turnSpeed}
                diffusionRate={diffusionRate}
                width={width}
                portrait={portrait}
            />
            <h1>FUNG</h1>
            <h2>is</h2>
            <h3>cool</h3>
        </main>
    )
}

export default FungContainer