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

export interface FungProps {
    fromColor?: string;
    toColor?: string;

    debug?: boolean

    agentCount?: number,
    moveSpeed?: number,
    turnSpeed?: number,

    senseDistance?: number,
    senseAngle?: number,

    diffusionRate?: number,
    evaporationRate?: number,
    densitySpread?: number,
}

const Defaults: FungProps = {
    fromColor: "lime",
    toColor: "yellow",

    debug: false,

    agentCount: 2000,
    moveSpeed: 50, // pixels per second - should not exceed minimum framerate
    turnSpeed: 12, // radians per second

    senseDistance: 8,
    senseAngle: 0.4,

    diffusionRate: 32,
    evaporationRate: 0.18,
    densitySpread: 0.8,
}

type GLInfo = {
    programs: { [key: string]: ProgramInfo },
    buffers: { [key: string]: BufferInfo },
    textures: { [key: string]: WebGLTexture },
    frameBuffers: { [key: string]: FramebufferInfo },
};

const FungCanvas = (props: FungProps) => {
    props = { ...Defaults, ...props};

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glInfoRef = useRef<GLInfo>();
    const flipFlopRef = useRef<boolean>(false);
    const lastTimeRef = useRef<number>(0);

    const minFrameRate = 50;


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

    const toRGBA = (color?: string): number[] => {
        const div = document.createElement('div');
        div.style.backgroundColor = color || 'none';
        document.body.appendChild(div);
        let rgba = getComputedStyle(div).getPropertyValue('background-color');
        div.remove();
        
        if (rgba.indexOf('rgba') === -1) {
            rgba += ',255'; // convert 'rgb(R,G,B)' to 'rgb(R,G,B)A' which looks awful but will pass the regxep below
        }

        const match = rgba.match(/[\.\d]+/g) || [0,0,0,0];
        
        return match.map(a => {
            return (+a) / 255
        });
    };

    const init = (gl: WebGLRenderingContext): GLInfo | undefined => {
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
        for (let i = 0; i < (props.agentCount || 2000); i++) {
            agentIds.push(i);
        }

        const bufferInfo = {
            quad: createBufferInfoFromArrays(gl, {
                a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
            }),
            agent: createBufferInfoFromArrays(gl, {
                agentId: { numComponents: 1, data: agentIds},
            }),
        };


        // Create textures
        const floatFormat = getHighestFloat(gl);
        if (floatFormat == null) {
            alert("Your browser does not support floating point textures");
            return;
        }

        const textures = createTextures(gl, {
            agentTexture1: { minMag: gl.NEAREST, width: props.agentCount, height: 1, type: floatFormat },
            agentTexture2: { minMag: gl.NEAREST, width: props.agentCount, height: 1, type: floatFormat },
            diffuseTexture1: { width: 640, height: 360 },
            diffuseTexture2: { width: 640, height: 360 },
            golTexture1: { minMag: gl.NEAREST, width: gl.canvas.width, height: gl.canvas.height },
            golTexture2: { minMag: gl.NEAREST, width: gl.canvas.width, height: gl.canvas.height },
            wallMask: { minMag: gl.NEAREST, src: wallMask, flipY: 1 },
        });


        // Create framebuffers for rendering to
        const agentBuffer1 = createFramebufferInfo(gl, [{ attachment: textures.agentTexture1, width: props.agentCount, height: 1 }]);
        const agentBuffer2 = createFramebufferInfo(gl, [{ attachment: textures.agentTexture2, width: props.agentCount, height: 1 }]);
        
        // Before we start, we'll initialise the agent data to something random
        const uniforms = {
            time: 0,
            resolution: [gl.canvas.width, gl.canvas.height],
            dimensions: [640, 360],
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


    useEffect(() => {
        const fromColor = toRGBA(props.fromColor);
        const toColor = toRGBA(props.toColor);

        const canvas = canvasRef.current;
        const gl = canvas?.getContext("webgl");
        if (!gl) {
            alert("Your browser does not support WebGL");
            return;
        }

        // Initialise a new buffer set, unless we already have made them previously
        glInfoRef.current = glInfoRef.current || init(gl);

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

                time: time,
                dt: dt,
                resolution: [gl.canvas.width, gl.canvas.height],
                dimensions: [640, 360], // Buffer size for diffusion is restricted and stretched to full resolution
                scale: gl.canvas.width / 640,

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
    ]);

    return <canvas ref={canvasRef} width={960} height={540}></canvas>;
};

export default FungCanvas;