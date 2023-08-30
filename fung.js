(function () {

    // Eventually this'll be turned into a React component
    // Until then, we'll just add a bunch of inputs here

    // Agent options
    const agentCount = 16000;
    const moveSpeed = 50; // pixels per second - should not exceed minimum framerate
    const turnSpeed = 12; // radians per second

    // Agent sensing options
    const senseDistance = 8; // pixels
    const senseAngle = 0.4; // radians

    // Diffusion options
    const evaporationRate = 0.18;
    const diffusionRate = 32;
    const densitySpread = 0.8;


    const minFrameRate = 50;


    function main() {
        const shadersToLoad = [
            'draw.vert',
            'draw.frag',
            'draw-rand.frag',
            'draw-agents.vert',
            'draw-agents.frag',
            'update-agents.frag',
            'diffuse.frag',
            'golstep.frag',
            'drawgol.frag',
        ];

        const promises = shadersToLoad.map(location => fetch('/shader/' + location).then(response => response.text()));

        Promise.all(promises)
            .then(sources => {
                const shaders = {};
                sources.forEach((source, i) => shaders[shadersToLoad[i]] = source);
                init(shaders);
            })
            .catch(error => {
                console.error(error);
            });
    }

    function init(sources) {
        // Get A WebGL context
        var canvas = document.querySelector("#main");
        var gl = canvas.getContext("webgl");
        if (!gl) {
            alert("Your browser does not support WebGL");
            return;
        }

        if (!gl.getExtension("OES_texture_float") || !gl.getExtension("OES_texture_float_linear")) {
            alert("Your browser does not support floating point textures");
            return;
        }

        const texProgramInfo = twgl.createProgramInfo(gl, [sources['draw.vert'], sources['draw.frag']]);
        const initProgramInfo = twgl.createProgramInfo(gl, [sources['draw.vert'], sources['draw-rand.frag']]);
        const moveProgramInfo = twgl.createProgramInfo(gl, [sources['draw.vert'], sources['update-agents.frag']]);
        const agentProgramInfo = twgl.createProgramInfo(gl, [sources['draw-agents.vert'], sources['draw-agents.frag']]);
        const diffuseProgramInfo = twgl.createProgramInfo(gl, [sources['draw.vert'], sources['diffuse.frag']]);
        const golProgramInfo = twgl.createProgramInfo(gl, [sources['draw.vert'], sources['golstep.frag']]);
        const drawGolProgramInfo = twgl.createProgramInfo(gl, [sources['draw.vert'], sources['drawgol.frag']]);

        const quadBufferInfo = twgl.createBufferInfoFromArrays(gl, {
            a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
        });

        const agentIds = [];
        for (let i = 0; i < agentCount; i++) {
            agentIds.push(i);
        }

        const agentBufferInfo = twgl.createBufferInfoFromArrays(gl, {
            agentId: { numComponents: 1, data: agentIds},
        })

        const textures = twgl.createTextures(gl, {
            agentTexture1: { minMag: gl.NEAREST, width: agentCount, height: 1, type: gl.FLOAT },
            agentTexture2: { minMag: gl.NEAREST, width: agentCount, height: 1, type: gl.FLOAT },
            diffuseTexture1: { minMag: gl.NEAREST, width: 640, height: 360 },
            diffuseTexture2: { minMag: gl.NEAREST, width: 640, height: 360 },
            golTexture1: { minMag: gl.NEAREST, width: gl.canvas.width, height: gl.canvas.height },
            golTexture2: { minMag: gl.NEAREST, width: gl.canvas.width, height: gl.canvas.height },
        });



        const agentBuffer1 = twgl.createFramebufferInfo(gl, [{ attachment: textures.agentTexture1, width: agentCount, height: 1 }]);
        const agentBuffer2 = twgl.createFramebufferInfo(gl, [{ attachment: textures.agentTexture2, width: agentCount, height: 1 }]);
        
        // Before we start, we'll initialise the agent data to something random
        const uniforms = {
            time: 0,
            resolution: [gl.canvas.width, gl.canvas.height],
        };
    
        // Draw a coloured quad
        gl.useProgram(initProgramInfo.program);
        twgl.setBuffersAndAttributes(gl, initProgramInfo, quadBufferInfo);
        twgl.setUniforms(initProgramInfo, uniforms);
        twgl.drawBufferInfo(gl, quadBufferInfo);



        const diffuseBuffer1 = twgl.createFramebufferInfo(gl, [{ attachment: textures.diffuseTexture1 }]);
        const diffuseBuffer2 = twgl.createFramebufferInfo(gl, [{ attachment: textures.diffuseTexture2 }]);



        const golBuffer1 = twgl.createFramebufferInfo(gl, [{ attachment: textures.golTexture1 }]);
        const golBuffer2 = twgl.createFramebufferInfo(gl, [{ attachment: textures.golTexture2 }]);
        
        // // DEBUG - Initialise GoL to random
        // gl.useProgram(initProgramInfo.program);
        // twgl.setBuffersAndAttributes(gl, initProgramInfo, quadBufferInfo);
        // twgl.setUniforms(initProgramInfo, uniforms);
        // twgl.drawBufferInfo(gl, quadBufferInfo);



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
            // twgl.resizeCanvasToDisplaySize(gl.canvas);
        
            const uniforms = {
                previousAgentFrame: flipFlop ? textures.agentTexture2 : textures.agentTexture1,
                previousDiffuseFrame: flipFlop ? textures.diffuseTexture2 : textures.diffuseTexture1,
                previousGolFrame: flipFlop ? textures.golTexture2 : textures.golTexture1,
                time: time,
                dt: dt,
                resolution: [gl.canvas.width, gl.canvas.height],
                dimensions: [640, 360], // Buffer size for diffusion is restricted and stretched to full resolution

                agentCount: agentCount,
                moveSpeed: moveSpeed,
                turnSpeed: turnSpeed,
                senseDistance: senseDistance,
                senseAngle: senseAngle,
                densitySpread: densitySpread,

                diffusionRate: diffusionRate,
                evaporationRate: evaporationRate,
            };

            // Draw to our agent position data buffer
            twgl.bindFramebufferInfo(gl, flipFlop ? agentBuffer1 : agentBuffer2);
        
            // Draw the agent buffer onto itself
            // This updates the agent positions, stored the results in a floating point texture!
            gl.useProgram(moveProgramInfo.program);
            twgl.setBuffersAndAttributes(gl, moveProgramInfo, quadBufferInfo);
            twgl.setUniforms(moveProgramInfo, uniforms);
            twgl.drawBufferInfo(gl, quadBufferInfo);



            // Draw to our diffuse buffer
            twgl.bindFramebufferInfo(gl, flipFlop ? diffuseBuffer2 : diffuseBuffer1);

            // Draw the agent positions into the diffuse buffer and run the diffuse
            gl.useProgram(agentProgramInfo.program);
            twgl.setBuffersAndAttributes(gl, agentProgramInfo, agentBufferInfo);
            twgl.setUniforms(agentProgramInfo, uniforms);
            twgl.drawBufferInfo(gl, agentBufferInfo, gl.POINTS);

            // Draw to our diffuse back buffer
            twgl.bindFramebufferInfo(gl, flipFlop ? diffuseBuffer1 : diffuseBuffer2);

            // Run diffuse double buffered as quad
            gl.useProgram(diffuseProgramInfo.program);
            twgl.setBuffersAndAttributes(gl, diffuseProgramInfo, quadBufferInfo);
            twgl.setUniforms(diffuseProgramInfo, uniforms);
            twgl.drawBufferInfo(gl, quadBufferInfo);

            

            // Run GoL sim!
            twgl.bindFramebufferInfo(gl, flipFlop ? golBuffer1 : golBuffer2);

            gl.useProgram(golProgramInfo.program);
            twgl.setBuffersAndAttributes(gl, golProgramInfo, quadBufferInfo);
            twgl.setUniforms(golProgramInfo, uniforms);
            twgl.drawBufferInfo(gl, quadBufferInfo);

            // Draw to GoL after sim
            gl.blendFunc(gl.ONE, gl.SRC_ALPHA);
            gl.useProgram(drawGolProgramInfo.program);
            twgl.setBuffersAndAttributes(gl, drawGolProgramInfo, quadBufferInfo);
            twgl.setUniforms(drawGolProgramInfo, uniforms);
            twgl.drawBufferInfo(gl, quadBufferInfo);
            gl.blendFunc(gl.ONE, gl.ZERO);



            // Now draw to the screen
            twgl.bindFramebufferInfo(gl);
            gl.clear(gl.COLOR_BUFFER_BIT);

            // Just drawing textures from here
            gl.useProgram(texProgramInfo.program);
            twgl.setBuffersAndAttributes(gl, texProgramInfo, quadBufferInfo);
            twgl.setUniforms(texProgramInfo, uniforms);

            // Draw the diffuse buffer (as debug)
            gl.bindTexture(gl.TEXTURE_2D, flipFlop ? textures.diffuseTexture2 : textures.diffuseTexture1);
            twgl.drawBufferInfo(gl, quadBufferInfo);

            // Draw the GoL buffer - final output!
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.bindTexture(gl.TEXTURE_2D, flipFlop ? textures.golTexture2 : textures.golTexture1);
            twgl.drawBufferInfo(gl, quadBufferInfo);
            gl.blendFunc(gl.ONE, gl.ZERO);



            requestAnimationFrame(render);
        }

        requestAnimationFrame(render);
    }

    main();

})();