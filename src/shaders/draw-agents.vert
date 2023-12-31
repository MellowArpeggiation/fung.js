attribute vec2 agentId;
// uniform float agentCount;
uniform vec2 dimensions;
uniform highp sampler2D previousAgentFrame;
uniform float scale;

#define PI radians(180.0)

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 pos = texture2D(previousAgentFrame, agentId / dimensions).xy;
    pos = (pos / scale) * 2.0 - 1.0;
    
    gl_Position = vec4(pos, 0, 1);
    gl_PointSize = 1.0;
}