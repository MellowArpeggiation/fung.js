precision mediump float;
#define PI 3.1415926538
#define TAU 6.2831853072

uniform sampler2D previousAgentFrame;
uniform sampler2D previousDiffuseFrame;
uniform float time;
uniform float agentCount;
uniform vec2 resolution;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 sense(vec2 pos, float angle, float angleOffset) {
    float dist = 0.008;
    float sensorAngle = angle + angleOffset;
    vec2 offset = vec2(cos(sensorAngle) * dist, sin(sensorAngle) * dist);

    return pos + offset;
}

void main() {
    float turnSpeed = 0.1;
    float moveSpeed = 0.001;
    float densitySpread = 0.8;
    float aspect = resolution.x / resolution.y;

    float agentId = gl_FragCoord.x / agentCount;
    vec4 agentCoords = texture2D(previousAgentFrame, vec2(agentId, 0));

    vec2 agentPosition = agentCoords.xy;
    float agentRotation = agentCoords.z * TAU;

    float weightForward = texture2D(previousDiffuseFrame, sense(agentPosition, agentRotation, 0.0)).r;
    float weightLeft = texture2D(previousDiffuseFrame, sense(agentPosition, agentRotation, -0.2)).r;
    float weightRight = texture2D(previousDiffuseFrame, sense(agentPosition, agentRotation, 0.2)).r;

    // Move the agent
    agentPosition = vec2(agentPosition.x + cos(agentRotation) * moveSpeed, agentPosition.y + sin(agentRotation) * moveSpeed * aspect);
    if (agentPosition.x < 0.0 || agentPosition.x > 1.0 || agentPosition.y < 0.0 || agentPosition.y > 1.0) {
        // Bounce randomly
        agentRotation = rand(agentPosition + time + agentId) * TAU;
    } else {
        if (weightForward > densitySpread) {
            agentRotation = fract((agentRotation + (rand(agentPosition + time + agentId) - 0.5) * turnSpeed) / TAU) * TAU;
        } else if (weightForward > weightLeft && weightForward > weightRight) {
            // Continue straight
        } else if (weightForward < weightLeft && weightForward < weightRight) {
            agentRotation = fract((agentRotation + (rand(agentPosition + time + agentId) - 0.5) * turnSpeed) / TAU) * TAU;
        } else if (weightLeft > weightRight) {
            agentRotation = fract((agentRotation - (rand(agentPosition + time + agentId)) * turnSpeed) / TAU) * TAU;
        } else if (weightLeft < weightRight) {
            agentRotation = fract((agentRotation + (rand(agentPosition + time + agentId)) * turnSpeed) / TAU) * TAU;
        } else {
            agentRotation = fract((agentRotation + (rand(agentPosition + time + agentId) - 0.5) * turnSpeed) / TAU) * TAU;
        }
    }
    // agentPosition = agentPosition + vec2(0, 0.001);

    gl_FragColor = vec4(agentPosition, agentRotation / TAU, 1);
    // gl_FragColor = agentCoords;
}