precision mediump float;
#define PI 3.1415926538
#define TAU 6.2831853072

uniform sampler2D previousAgentFrame;
uniform sampler2D previousDiffuseFrame;

uniform float time;
uniform float dt;

uniform vec2 resolution;
uniform vec2 dimensions;

uniform float agentCount;
uniform float moveSpeed;
uniform float turnSpeed;
uniform float senseDistance;
uniform float senseAngle;
uniform float densitySpread;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 sense(vec2 pos, float angle, float angleOffset) {
    float sensorAngle = angle + angleOffset;
    vec2 offset = vec2(cos(sensorAngle) * (senseDistance / resolution.x), sin(sensorAngle) * (senseDistance / resolution.y));

    return pos + offset;
}

void main() {
    float aspect = resolution.x / resolution.y;

    float agentId = gl_FragCoord.x / agentCount;
    vec4 agentCoords = texture2D(previousAgentFrame, vec2(agentId, 0));

    vec2 agentPosition = agentCoords.xy;
    float agentRotation = agentCoords.z * TAU;

    float weightForward = texture2D(previousDiffuseFrame, sense(agentPosition, agentRotation, 0.0)).r;
    float weightLeft = texture2D(previousDiffuseFrame, sense(agentPosition, agentRotation, -senseAngle)).r;
    float weightRight = texture2D(previousDiffuseFrame, sense(agentPosition, agentRotation, senseAngle)).r;

    float random = rand(agentPosition + gl_FragCoord.xy + time);

    // Move the agent
    agentPosition = vec2(agentPosition.x + (cos(agentRotation) / resolution.x) * moveSpeed * dt, agentPosition.y + (sin(agentRotation) / resolution.y) * moveSpeed * dt);
    if (agentPosition.x < 0.0 || agentPosition.x > 1.0 || agentPosition.y < 0.0 || agentPosition.y > 1.0) {
        // Bounce randomly
        agentRotation = random * TAU;
    } else {
        if (weightForward > densitySpread) {
            agentRotation = fract((agentRotation + (random - 0.5) * turnSpeed * dt) / TAU) * TAU;
        } else if (weightForward > weightLeft && weightForward > weightRight) {
            // Continue straight
        } else if (weightForward < weightLeft && weightForward < weightRight) {
            agentRotation = fract((agentRotation + (random - 0.5) * turnSpeed * dt) / TAU) * TAU;
        } else if (weightLeft > weightRight) {
            agentRotation = fract((agentRotation - (random) * turnSpeed * dt) / TAU) * TAU;
        } else if (weightLeft < weightRight) {
            agentRotation = fract((agentRotation + (random) * turnSpeed * dt) / TAU) * TAU;
        } else {
            agentRotation = fract((agentRotation + (random - 0.5) * turnSpeed * dt) / TAU) * TAU;
        }
    }

    gl_FragColor = vec4(agentPosition, agentRotation / TAU, 1);
}