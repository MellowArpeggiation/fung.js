import React, { useEffect, useRef } from "react";
import { bindFramebufferInfo, createBufferInfoFromArrays, createFramebufferInfo, createProgramInfo, createTextures, drawBufferInfo, setBuffersAndAttributes, setUniforms, ProgramInfo, BufferInfo, FramebufferInfo } from "twgl.js";

import vDraw from "../../shaders/draw.vert";
import fDraw from "../../shaders/draw.frag";
import fDrawRand from "../../shaders/draw-rand.frag";
import fUpdateAgents from "../../shaders/update-agents.frag";
import vDrawAgents from "../../shaders/draw-agents.vert";
import fDrawAgents from "../../shaders/draw-agents.frag";
import fDiffuse from "../../shaders/diffuse.frag";
import fGolStep from "../../shaders/golstep.frag";
import fDrawGol from "../../shaders/drawgol.frag";
import fFung from "../../shaders/fung.frag";

import wallMask from "../../../img/map.png";
import dither from "../../../img/bluenoise.png";

export interface FungProps {
    className?: string;
    width: number;
    portrait?: boolean;

    fromColor: string;
    toColor: string;

    debug: boolean

    agentCount: number,
    moveSpeed: number,
    turnSpeed: number,

    senseDistance: number,
    senseAngle: number,

    diffusionRate: number,
    evaporationRate: number,
    densitySpread: number,
}

const Defaults: FungProps = {
    width: 640,

    fromColor: "lime",
    toColor: "yellow",

    debug: false,

    agentCount: 20000, // Maximum of 230,400 - theoretically
    moveSpeed: 50, // pixels per second - should not exceed minimum framerate
    turnSpeed: 12, // radians per second

    senseDistance: 8,
    senseAngle: 0.4,

    diffusionRate: 64,
    evaporationRate: 0.2,
    densitySpread: 1,
}

type GLInfo = {
    programs: { [key: string]: ProgramInfo },
    buffers: { [key: string]: BufferInfo },
    textures: { [key: string]: WebGLTexture },
    frameBuffers: { [key: string]: FramebufferInfo },
};

const HSLAToRGBA = (hsla: number[]) => {
    let h = hsla[0];
    let s = hsla[1];
    let l = hsla[2];

    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const b = s * Math.min(l, 1 - l);
    const f = (n: number) =>
        l - b * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [255 * f(0), 255 * f(8), 255 * f(4), hsla[3]];
};

// Memoised so we don't have to create too many DOM elements
const builtinColors = {};
const builtinToRGBA = (builtin: string) => {
    if ((builtinColors as any)[builtin]) {
        return (builtinColors as any)[builtin];
    }

    const div = document.createElement('div');
    div.style.backgroundColor = builtin;
    document.body.appendChild(div);
    let computed = getComputedStyle(div).getPropertyValue('background-color');
    div.remove();
    
    if (computed.indexOf('rgba') === -1) {
        computed += ',255'; // convert 'rgb(R,G,B)' to 'rgb(R,G,B)A' which looks awful but will pass the regxep below
    }

    const rgba = splitColors(computed);

    (builtinColors as any)[builtin] = rgba;

    return rgba;
};

const hexToRGBA = (hex: string) => {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        parseInt(result[4] || '255', 16),
    ] : [0, 0, 0, 0];
}

const splitColors = (input: string): any[] => {
    return input.match(/[\.\d]+/g) || [0, 0, 0, 0];
}


const toRGBA = (color: string): number[] => {
    let rgba = [0, 0, 0, 0];
    if (color.indexOf('rgba') === 0) {
        // is fully defined colour, no transforms needed
        rgba = splitColors(color);
    } else if (color.indexOf('rgb') === 0) {
        rgba = splitColors(color + ',255');
    } else if (color.indexOf('hsla') === 0) {
        rgba = HSLAToRGBA(splitColors(color));
    } else if (color.indexOf('hsl') === 0) {
        rgba = HSLAToRGBA(splitColors(color + ',255'));
    } else if (color.indexOf('#') === 0) {
        rgba = hexToRGBA(color);
    } else {
        rgba = builtinToRGBA(color);
    }
    
    return rgba.map(a => {
        return (+a) / 255
    });
};

const init = (gl: WebGLRenderingContext, agentCount: number, internalWidth: number, internalHeight: number): GLInfo | undefined => {
    // Create shader programs
    const programInfo = {
        tex: createProgramInfo(gl, [vDraw, fDraw]),
        init: createProgramInfo(gl, [vDraw, fDrawRand]),
        move: createProgramInfo(gl, [vDraw, fUpdateAgents]),
        agent: createProgramInfo(gl, [vDrawAgents, fDrawAgents]),
        diffuse: createProgramInfo(gl, [vDraw, fDiffuse]),
        gol: createProgramInfo(gl, [vDraw, fGolStep]),
        drawGol: createProgramInfo(gl, [vDraw, fDrawGol]),
        fung: createProgramInfo(gl, [vDraw, fFung]),
    };


    // Create data buffers
    const agentIds = [];
    for (let i = 0; i < (agentCount); i++) {
        agentIds.push(i % internalWidth); // x
        agentIds.push(Math.floor(i / internalWidth)); // y
    }

    const bufferInfo = {
        quad: createBufferInfoFromArrays(gl, {
            a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
        }),
        agent: createBufferInfoFromArrays(gl, {
            agentId: { numComponents: 2, data: agentIds},
        }),
    };


    // Create textures
    const floatFormat = getHighestFloat(gl);
    if (floatFormat == null) {
        alert("Your browser does not support floating point textures");
        return;
    }

    const textures = createTextures(gl, {
        agentTexture1: { minMag: gl.NEAREST, width: internalWidth, height: internalHeight, type: floatFormat },
        agentTexture2: { minMag: gl.NEAREST, width: internalWidth, height: internalHeight, type: floatFormat },
        diffuseTexture1: { width: internalWidth, height: internalHeight },
        diffuseTexture2: { width: internalWidth, height: internalHeight },
        golTexture1: { minMag: gl.NEAREST, width: gl.canvas.width, height: gl.canvas.height },
        golTexture2: { minMag: gl.NEAREST, width: gl.canvas.width, height: gl.canvas.height },
        wallMask: { minMag: gl.NEAREST, src: wallMask, flipY: 1 },
        dither: { src: dither },
    });


    // Create framebuffers for rendering to
    const agentBuffer1 = createFramebufferInfo(gl, [{ attachment: textures.agentTexture1, width: internalWidth, height: internalHeight }]);
    const agentBuffer2 = createFramebufferInfo(gl, [{ attachment: textures.agentTexture2, width: internalWidth, height: internalHeight }]);
    
    // Before we start, we'll initialise the agent data to something random
    const uniforms = {
        time: 0,
        resolution: [gl.canvas.width, gl.canvas.height],
        dimensions: [internalWidth, internalHeight],
        wallMask: textures.wallMask,
    };

    // Draw a randomly coloured quad to initialise agents
    gl.useProgram(programInfo.init.program);
    setBuffersAndAttributes(gl, programInfo.init, bufferInfo.quad);
    setUniforms(programInfo.init, uniforms);
    drawBufferInfo(gl, bufferInfo.quad);


    const diffuseBuffer1 = createFramebufferInfo(gl, [{ attachment: textures.diffuseTexture1 }]);
    const diffuseBuffer2 = createFramebufferInfo(gl, [{ attachment: textures.diffuseTexture2 }]);

    const golBuffer1 = createFramebufferInfo(gl, [{ attachment: textures.golTexture1 }]);
    const golBuffer2 = createFramebufferInfo(gl, [{ attachment: textures.golTexture2 }]);

    const frameBuffers = {
        agent1: agentBuffer1,
        agent2: agentBuffer2,
        diffuse1: diffuseBuffer1,
        diffuse2: diffuseBuffer2,
        gol1: golBuffer1,
        gol2: golBuffer2,
    };

    return {
        programs: programInfo,
        buffers: bufferInfo,
        textures: textures,
        frameBuffers: frameBuffers,
    }
};


// iOS Safari does this fucky thing where they say they support writing to floating point textures
// But they don't actually support it and don't even fallback to half-floats that ARE supported
// and also don't report any errors or give you any fucking information at all, they just truck on with 8 bits (OR LESS!) of precision
// Yes, I tried gl.checkFramebufferStatus, it reports gl.FRAMEBUFFER_COMPLETE in all tests
// So we have to just... guess
const getHighestFloat = (gl: WebGLRenderingContext) => {
    const isIOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent);
    const isAppleDevice = navigator.userAgent.includes('Macintosh');
    const isTouchScreen = navigator.maxTouchPoints >= 1;
    if (isIOS || (isAppleDevice && isTouchScreen)) {
        const halfFloatExtension = gl.getExtension("OES_texture_half_float");
        return halfFloatExtension?.HALF_FLOAT_OES;
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
};


const FungCanvas = (inputProps: Partial<FungProps>) => {
    const props = { ...Defaults, ...inputProps};

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glInfoRef = useRef<GLInfo>();
    const flipFlopRef = useRef<boolean>(false);
    const lastTimeRef = useRef<number>(0);
    const dimRef = useRef<number>(props.width);
    const portraitRef = useRef<boolean>(props.portrait || false);
    // const heightRef = useRef<number>(props.width * (9/16));

    const minFrameRate = 50;
    
    let canvasHeight = props.width * (9/16);
    if (props.portrait) {
        canvasHeight = props.width * (16/9);
    }


    useEffect(() => {
        let internalWidth = 640;
        let internalHeight = 360;

        if (props.portrait) {
            internalWidth = 360;
            internalHeight = 640;
        }

        const fromColor = toRGBA(props.fromColor);
        const toColor = toRGBA(props.toColor);

        const canvas = canvasRef.current;
        const gl = canvas?.getContext("webgl");
        if (!gl) {
            alert("Your browser does not support WebGL");
            return;
        }

        // Initialise a new buffer set, unless we already have made them previously
        if (!glInfoRef.current || dimRef.current !== props.width || portraitRef.current !== props.portrait) {
            glInfoRef.current = init(gl, props.agentCount, internalWidth, internalHeight);
            dimRef.current = props.width;
            portraitRef.current = props.portrait || false;
            flipFlopRef.current = false;
        }

        if (glInfoRef.current == null) {
            alert("Failed to initialise buffers");
            return;
        }

        // Destructure for quick access
        const {programs, buffers, textures, frameBuffers} = glInfoRef.current;


        gl.enable(gl.BLEND)
        gl.clearColor(0, 0, 0, 1);

        const minDt = 1/minFrameRate;

        let renderId: number;

        function render(time: number) {
            if (!gl) {
                alert("WebGL has been disabled");
                return;
            }

            time = time * 0.001;
            let dt = Math.min(time - lastTimeRef.current, minDt);
            lastTimeRef.current = time;

            flipFlopRef.current = !flipFlopRef.current;
            const flipFlop = flipFlopRef.current;
        
            const uniforms = {
                previousAgentFrame: flipFlop ? textures.agentTexture2 : textures.agentTexture1,
                previousDiffuseFrame: flipFlop ? textures.diffuseTexture2 : textures.diffuseTexture1,
                previousGolFrame: flipFlop ? textures.golTexture2 : textures.golTexture1,
                wallMask: textures.wallMask,
                dither: textures.dither,

                time: time,
                dt: dt,
                resolution: [gl.canvas.width, gl.canvas.height],
                dimensions: [internalWidth, internalHeight], // Buffer size for diffusion is restricted and stretched to full resolution
                scale: gl.canvas.width / internalWidth,

                agentCount: props.agentCount,
                moveSpeed: props.moveSpeed,
                turnSpeed: props.turnSpeed,
                senseDistance: props.senseDistance,
                senseAngle: props.senseAngle,
                densitySpread: props.densitySpread,

                diffusionRate: props.diffusionRate,
                evaporationRate: props.evaporationRate,

                fromColor: fromColor,
                toColor: toColor,
            };

            // Draw to our agent position data buffer
            bindFramebufferInfo(gl, flipFlop ? frameBuffers.agent1 : frameBuffers.agent2);
        
            // Draw the agent buffer onto itself
            // This updates the agent positions, stored the results in a floating point texture!
            gl.useProgram(programs.move.program);
            setBuffersAndAttributes(gl, programs.move, buffers.quad);
            setUniforms(programs.move, uniforms);
            drawBufferInfo(gl, buffers.quad);



            // Draw to our diffuse buffer
            bindFramebufferInfo(gl, flipFlop ? frameBuffers.diffuse2 : frameBuffers.diffuse1);

            // Draw the agent positions into the diffuse buffer and run the diffuse
            gl.useProgram(programs.agent.program);
            setBuffersAndAttributes(gl, programs.agent, buffers.agent);
            setUniforms(programs.agent, uniforms);
            drawBufferInfo(gl, buffers.agent, gl.POINTS);

            // Draw to our diffuse back buffer
            bindFramebufferInfo(gl, flipFlop ? frameBuffers.diffuse1 : frameBuffers.diffuse2);

            // Run diffuse double buffered as quad
            gl.useProgram(programs.diffuse.program);
            setBuffersAndAttributes(gl, programs.diffuse, buffers.quad);
            setUniforms(programs.diffuse, uniforms);
            drawBufferInfo(gl, buffers.quad);

            

            // Run GoL sim!
            bindFramebufferInfo(gl, flipFlop ? frameBuffers.gol1 : frameBuffers.gol2);

            gl.useProgram(programs.gol.program);
            setBuffersAndAttributes(gl, programs.gol, buffers.quad);
            setUniforms(programs.gol, uniforms);
            drawBufferInfo(gl, buffers.quad);

            // Draw to GoL after sim
            gl.blendFunc(gl.ONE, gl.SRC_ALPHA);
            gl.useProgram(programs.drawGol.program);
            setBuffersAndAttributes(gl, programs.drawGol, buffers.quad);
            setUniforms(programs.drawGol, uniforms);
            drawBufferInfo(gl, buffers.quad);
            gl.blendFunc(gl.ONE, gl.ZERO);



            // Now draw to the screen
            bindFramebufferInfo(gl);
            gl.clear(gl.COLOR_BUFFER_BIT);

            if (props.debug) {
                // Draw the diffuse buffer (as debug)
                gl.useProgram(programs.tex.program);
                setBuffersAndAttributes(gl, programs.tex, buffers.quad);
                setUniforms(programs.tex, uniforms);
                gl.bindTexture(gl.TEXTURE_2D, flipFlop ? textures.diffuseTexture2 : textures.diffuseTexture1);
                drawBufferInfo(gl, buffers.quad);
            } else {
                // Draw the GoL buffer with colours - final output!
                gl.useProgram(programs.fung.program);
                setBuffersAndAttributes(gl, programs.fung, buffers.quad);
                setUniforms(programs.fung, uniforms);
                drawBufferInfo(gl, buffers.quad);
            }

            renderId = requestAnimationFrame(render);
        }

        renderId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(renderId);
        }
    }, [
        props.fromColor,
        props.toColor,
        props.debug,
        props.agentCount,
        props.moveSpeed,
        props.turnSpeed,
        props.senseDistance,
        props.senseAngle,
        props.diffusionRate,
        props.evaporationRate,
        props.densitySpread,
        props.width,
    ]);

    return <canvas ref={canvasRef} className={props.className} width={props.width} height={canvasHeight}></canvas>;
};

export default FungCanvas;