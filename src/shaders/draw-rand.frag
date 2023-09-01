precision highp float;

uniform sampler2D wallMask;

float rand(vec2 st) {
    return fract(sin(dot(st.xy,vec2(12.9891238,78.223433)))*43758.5453123);
}

void main() {
    vec2 agentPosition = vec2(rand(gl_FragCoord.xy), rand(-gl_FragCoord.xy));
    float agentRotation = rand(gl_FragCoord.xy + 2000.0);

    for (float i = 1.0; i < 10.0; i += 1.0) {
        if (texture2D(wallMask, agentPosition).r < 0.5) break;
        agentPosition = vec2(rand(gl_FragCoord.xy + vec2(i * 0.01, 0)), rand(-gl_FragCoord.xy + vec2(0, i * 0.01)));
    }

    // Workaround for randomisation not working in a React context
    // I uh... have no idea
    agentPosition.y = 0.2 + agentPosition.y * 0.1;

    gl_FragColor = vec4(agentPosition, agentRotation, 1);
}