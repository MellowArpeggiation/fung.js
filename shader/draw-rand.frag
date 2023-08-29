precision mediump float;

float rand(vec2 st) {
    return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43758.5453123);
}

void main() {
    gl_FragColor = vec4(rand(gl_FragCoord.xy), rand(gl_FragCoord.xy + 1000.0), rand(gl_FragCoord.xy + 2000.0), 1);
}