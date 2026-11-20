#version 300 es
precision highp float;

in float v_alpha;
out vec4 outColor;

void main() {
    vec3 col = vec3(0.949, 0.957, 0.973);
    outColor = vec4(col * v_alpha, v_alpha);
}
