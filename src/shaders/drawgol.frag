precision mediump float;

uniform sampler2D previousGolFrame;
uniform sampler2D previousDiffuseFrame;
uniform sampler2D dither;
uniform vec2 resolution;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float prev = texture2D(previousGolFrame, uv).r;
    float value = texture2D(previousDiffuseFrame, uv).r;
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);

    if (value > 0.8) { // Add
        float addValue = texture2D(dither, gl_FragCoord.xy / 128.0).r * 0.2 - 0.1;
        value += addValue;
        color = vec4(step(0.8, value));
    } else if (value < 0.05) { // Clear
        color = vec4(0.0);
    }

    gl_FragColor = color;
}