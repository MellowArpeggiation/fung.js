import React, { useEffect, useRef } from "react";
import { bindFramebufferInfo, createBufferInfoFromArrays, createFramebufferInfo, createProgramInfo, createTextures, drawBufferInfo, setBuffersAndAttributes, setUniforms } from "twgl.js";

import vDraw from "../../../shader/draw.vert";
import fDraw from "../../../shader/draw.frag";
import fDrawRand from "../../../shader/draw-rand.frag";
import fUpdateAgents from "../../../shader/update-agents.frag";
import vDrawAgents from "../../../shader/draw-agents.vert";
import fDrawAgents from "../../../shader/draw-agents.frag";
import fDiffuse from "../../../shader/diffuse.frag";
import fGolStep from "../../../shader/golstep.frag";
import fDrawGol from "../../../shader/drawgol.frag";
import fFung from "../../../shader/fung.frag";

import wallMask from "../../../img/map.png";

export interface FungProps {
    label: string;
}

const FungCanvas = (props: FungProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);


    const debugMode = false;

    // Agent options
    const agentCount = 2000;
    const moveSpeed = 50; // pixels per second - should not exceed minimum framerate
    const turnSpeed = 12; // radians per second

    // Agent sensing options
    const senseDistance = 8; // pixels
    const senseAngle = 0.4; // radians

    // Diffusion options
    const evaporationRate = 0.18;
    let diffusionRate = 32;
    const densitySpread = 0.8;

    // Color options
    let fromColor = [0, 1, 0, 1];
    let toColor = [1, 1, 0, 1];

    const minFrameRate = 50;



    const draw = gl => {

    }


    // iOS Safari does this fucky thing where they say they support writing to floating point textures
    // But they don't actually support it and don't even fallback to half-floats that ARE supported
    // and also don't report any errors or give you any fucking information at all, they just truck on with 8 bits (OR LESS!) of precision
    // Yes, I tried gl.checkFramebufferStatus, it reports gl.FRAMEBUFFER_COMPLETE in all tests
    // So we have to just... guess
    function getHighestFloat(gl) {
        const isIOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent);
        const isAppleDevice = navigator.userAgent.includes('Macintosh');
        const isTouchScreen = navigator.maxTouchPoints >= 1;
        if (isIOS || (isAppleDevice && isTouchScreen)) {
            const halfFloatExtension = gl.getExtension("OES_texture_half_float");
            return halfFloatExtension.HALF_FLOAT_OES;
        }

        const floatExtension = gl.getExtension("OES_texture_float");
        if (floatExtension) {
            return gl.FLOAT;
        }

        const halfFloatExtension = gl.getExtension("OES_texture_half_float");
        if (halfFloatExtension) {
            return halfFloatExtension.HALF_FLOAT_OES;
        }

        return null;
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        const gl = canvas?.getContext("webgl");
        if (!gl) {
            alert("Your browser does not support WebGL");
            return;
        }

        const floatFormat = getHighestFloat(gl);


        const texProgramInfo = createProgramInfo(gl, [vDraw, fDraw]);
        const initProgramInfo = createProgramInfo(gl, [vDraw, fDrawRand]);
        const moveProgramInfo = createProgramInfo(gl, [vDraw, fUpdateAgents]);
        const agentProgramInfo = createProgramInfo(gl, [vDrawAgents, fDrawAgents]);
        const diffuseProgramInfo = createProgramInfo(gl, [vDraw, fDiffuse]);
        const golProgramInfo = createProgramInfo(gl, [vDraw, fGolStep]);
        const drawGolProgramInfo = createProgramInfo(gl, [vDraw, fDrawGol]);
        const fungProgramInfo = createProgramInfo(gl, [vDraw, fFung]);

        
        const quadBufferInfo = createBufferInfoFromArrays(gl, {
            a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
        });

        const agentIds = [];
        for (let i = 0; i < agentCount; i++) {
            agentIds.push(i);
        }

        const agentBufferInfo = createBufferInfoFromArrays(gl, {
            agentId: { numComponents: 1, data: agentIds},
        })

        const textures = createTextures(gl, {
            agentTexture1: { minMag: gl.NEAREST, width: agentCount, height: 1, type: floatFormat },
            agentTexture2: { minMag: gl.NEAREST, width: agentCount, height: 1, type: floatFormat },
            diffuseTexture1: { width: 640, height: 360 },
            diffuseTexture2: { width: 640, height: 360 },
            golTexture1: { minMag: gl.NEAREST, width: gl.canvas.width, height: gl.canvas.height },
            golTexture2: { minMag: gl.NEAREST, width: gl.canvas.width, height: gl.canvas.height },
            wallMask: { minMag: gl.NEAREST, src: wallMask, flipY: true },
        });



        const agentBuffer1 = createFramebufferInfo(gl, [{ attachment: textures.agentTexture1, width: agentCount, height: 1 }]);
        const agentBuffer2 = createFramebufferInfo(gl, [{ attachment: textures.agentTexture2, width: agentCount, height: 1 }]);
        
        // Before we start, we'll initialise the agent data to something random
        const uniforms = {
            time: 0,
            resolution: [gl.canvas.width, gl.canvas.height],
            dimensions: [640, 360],
            wallMask: textures.wallMask,
        };
    
        // Draw a coloured quad
        gl.useProgram(initProgramInfo.program);
        setBuffersAndAttributes(gl, initProgramInfo, quadBufferInfo);
        setUniforms(initProgramInfo, uniforms);
        drawBufferInfo(gl, quadBufferInfo);



        const diffuseBuffer1 = createFramebufferInfo(gl, [{ attachment: textures.diffuseTexture1 }]);
        const diffuseBuffer2 = createFramebufferInfo(gl, [{ attachment: textures.diffuseTexture2 }]);



        const golBuffer1 = createFramebufferInfo(gl, [{ attachment: textures.golTexture1 }]);
        const golBuffer2 = createFramebufferInfo(gl, [{ attachment: textures.golTexture2 }]);
        
        // // DEBUG - Initialise GoL to random
        // gl.useProgram(initProgramInfo.program);
        // setBuffersAndAttributes(gl, initProgramInfo, quadBufferInfo);
        // setUniforms(initProgramInfo, uniforms);
        // drawBufferInfo(gl, quadBufferInfo);



        gl.enable(gl.BLEND)
        gl.clearColor(0, 0, 0, 1);

        const minDt = 1/minFrameRate;

        let lastTime = 0;
        let flipFlop = false;
        function render(time) {
            time = time * 0.001;
            let dt = Math.min(time - lastTime, minDt);
            lastTime = time;

            flipFlop = !flipFlop;
        
            const uniforms = {
                previousAgentFrame: flipFlop ? textures.agentTexture2 : textures.agentTexture1,
                previousDiffuseFrame: flipFlop ? textures.diffuseTexture2 : textures.diffuseTexture1,
                previousGolFrame: flipFlop ? textures.golTexture2 : textures.golTexture1,
                wallMask: textures.wallMask,

                time: time,
                dt: dt,
                resolution: [gl.canvas.width, gl.canvas.height],
                dimensions: [640, 360], // Buffer size for diffusion is restricted and stretched to full resolution
                scale: gl.canvas.width / 640,

                agentCount: agentCount,
                moveSpeed: moveSpeed,
                turnSpeed: turnSpeed,
                senseDistance: senseDistance,
                senseAngle: senseAngle,
                densitySpread: densitySpread,

                diffusionRate: diffusionRate,
                evaporationRate: evaporationRate,

                fromColor: fromColor,
                toColor: toColor,
            };

            // Draw to our agent position data buffer
            bindFramebufferInfo(gl, flipFlop ? agentBuffer1 : agentBuffer2);
        
            // Draw the agent buffer onto itself
            // This updates the agent positions, stored the results in a floating point texture!
            gl.useProgram(moveProgramInfo.program);
            setBuffersAndAttributes(gl, moveProgramInfo, quadBufferInfo);
            setUniforms(moveProgramInfo, uniforms);
            drawBufferInfo(gl, quadBufferInfo);



            // Draw to our diffuse buffer
            bindFramebufferInfo(gl, flipFlop ? diffuseBuffer2 : diffuseBuffer1);

            // Draw the agent positions into the diffuse buffer and run the diffuse
            gl.useProgram(agentProgramInfo.program);
            setBuffersAndAttributes(gl, agentProgramInfo, agentBufferInfo);
            setUniforms(agentProgramInfo, uniforms);
            drawBufferInfo(gl, agentBufferInfo, gl.POINTS);

            // Draw to our diffuse back buffer
            bindFramebufferInfo(gl, flipFlop ? diffuseBuffer1 : diffuseBuffer2);

            // Run diffuse double buffered as quad
            gl.useProgram(diffuseProgramInfo.program);
            setBuffersAndAttributes(gl, diffuseProgramInfo, quadBufferInfo);
            setUniforms(diffuseProgramInfo, uniforms);
            drawBufferInfo(gl, quadBufferInfo);

            

            // Run GoL sim!
            bindFramebufferInfo(gl, flipFlop ? golBuffer1 : golBuffer2);

            gl.useProgram(golProgramInfo.program);
            setBuffersAndAttributes(gl, golProgramInfo, quadBufferInfo);
            setUniforms(golProgramInfo, uniforms);
            drawBufferInfo(gl, quadBufferInfo);

            // Draw to GoL after sim
            gl.blendFunc(gl.ONE, gl.SRC_ALPHA);
            gl.useProgram(drawGolProgramInfo.program);
            setBuffersAndAttributes(gl, drawGolProgramInfo, quadBufferInfo);
            setUniforms(drawGolProgramInfo, uniforms);
            drawBufferInfo(gl, quadBufferInfo);
            gl.blendFunc(gl.ONE, gl.ZERO);



            // Now draw to the screen
            bindFramebufferInfo(gl);
            gl.clear(gl.COLOR_BUFFER_BIT);

            if (debugMode) {
                // Draw the diffuse buffer (as debug)
                gl.useProgram(texProgramInfo.program);
                setBuffersAndAttributes(gl, texProgramInfo, quadBufferInfo);
                setUniforms(texProgramInfo, uniforms);
                gl.bindTexture(gl.TEXTURE_2D, flipFlop ? textures.diffuseTexture2 : textures.diffuseTexture1);
                drawBufferInfo(gl, quadBufferInfo);
            } else {
                // Draw the GoL buffer with colours - final output!
                gl.useProgram(fungProgramInfo.program);
                setBuffersAndAttributes(gl, fungProgramInfo, quadBufferInfo);
                setUniforms(fungProgramInfo, uniforms);
                drawBufferInfo(gl, quadBufferInfo);
            }

            requestAnimationFrame(render);
        }

        requestAnimationFrame(render);
    }, []);

    return <canvas ref={canvasRef} width={640} height={360}></canvas>;
};

export default FungCanvas;