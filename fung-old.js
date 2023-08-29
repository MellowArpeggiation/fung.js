(function () {

    function createShader(gl, type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (success) {
            return shader;
        }

        console.log(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }

    function createProgram(gl, vertexShader, fragmentShader) {
        var program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        var success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
            return program;
        }

        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }

    function main() {
        const shadersToLoad = [
            'draw.vert',
            'draw-agents.vert',
            'draw-agents.frag',
            'update-agents.frag',
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
            return;
        }

        // create GLSL shaders, upload the GLSL source, compile the shaders
        var agentVertShader = createShader(gl, gl.VERTEX_SHADER, sources['draw-agents.vert']);
        var agentFragShader = createShader(gl, gl.FRAGMENT_SHADER, sources['draw-agents.frag']);

        // Link the two shaders into a program
        var agentProgram = createProgram(gl, agentVertShader, agentFragShader);

        // look up where the vertex data needs to go.
        const vertexIdLoc = gl.getAttribLocation(agentProgram, 'vertexId');
        const numVertsLoc = gl.getUniformLocation(agentProgram, 'numVerts');
        const resolutionLoc = gl.getUniformLocation(agentProgram, 'resolution');
        const timeLoc = gl.getUniformLocation(agentProgram, 'time');


        // Clear the canvas
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);



        // Store the agent xyr attributes in the rgb values of an image
        // A shader will handle the movement of the agents, based on the trail input image
        const level = 0;
        const agentTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, agentTexture);
        gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA, 640, 360, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // // Create a framebuffer for generating the output of the texture
        const agentBuffer = gl.createFramebuffer();
        const attachmentPoint = gl.COLOR_ATTACHMENT0;

        // This enables drawing to the buffer
        // gl.bindFramebuffer(gl.FRAMEBUFFER, agentBuffer);
        // gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, agentTexture, level);




        var quadVertShader = createShader(gl, gl.VERTEX_SHADER, sources['draw.vert']);
        var quadFragShader = createShader(gl, gl.FRAGMENT_SHADER, sources['update-agents.frag']);

        var quadProgram = createProgram(gl, quadVertShader, quadFragShader);

        const positionLoc = gl.getAttribLocation(quadProgram, "a_position");

        
        // Create a buffer to store a basic screen filling quad
        const positionBuffer = gl.createBuffer();

        // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        // fill it with a 2 triangles that cover clipspace
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  // first triangle
            1, -1,
            -1,  1,
            -1,  1,  // second triangle
            1, -1,
            1,  1,
        ]), gl.STATIC_DRAW);



        // Make a buffer with just a count in it.
        const numVerts = 20;
        const vertexIds = new Float32Array(numVerts);
        vertexIds.forEach((v, i) => {
            vertexIds[i] = i;
        });
        
        const idBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, idBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexIds, gl.STATIC_DRAW);
        
        
        function render(time) {
            time *= 0.001;

            // draw
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);


            gl.useProgram(quadProgram);

            {
                // Turn on the attribute
                gl.enableVertexAttribArray(positionLoc);
    
                // Bind the position buffer.
                gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    
                // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
                gl.vertexAttribPointer(
                    positionLoc,
                    2,          // 2 components per iteration
                    gl.FLOAT,   // the data is 32bit floats
                    false,      // don't normalize the data
                    0,          // 0 = move forward size * sizeof(type) each iteration to get the next position
                    0,          // start at the beginning of the buffer
                );
            }

            gl.drawArrays(
                gl.TRIANGLES,
                0,     // offset
                6,     // num vertices to process
            );


            
            gl.useProgram(agentProgram);
            
            {
                // Turn on the attribute
                gl.enableVertexAttribArray(vertexIdLoc);
            
                // Bind the id buffer.
                gl.bindBuffer(gl.ARRAY_BUFFER, idBuffer);
            
                // Tell the attribute how to get data out of idBuffer (ARRAY_BUFFER)
                const size = 1;          // 1 components per iteration
                const type = gl.FLOAT;   // the data is 32bit floats
                const normalize = false; // don't normalize the data
                const stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
                const offset = 0;        // start at the beginning of the buffer
                gl.vertexAttribPointer(vertexIdLoc, size, type, normalize, stride, offset);
            }
            
            // tell the shader the number of verts
            gl.uniform1f(numVertsLoc, numVerts);
            // tell the shader the resolution
            gl.uniform2f(resolutionLoc, gl.canvas.width, gl.canvas.height);

            gl.uniform1f(timeLoc, time);
            
            const offset = 0;
            gl.drawArrays(gl.POINTS, offset, numVerts);




            requestAnimationFrame(render);
        }

        requestAnimationFrame(render);
    }

    main();

})();