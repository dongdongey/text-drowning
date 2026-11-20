#version 300 es
precision highp float;

in float v_alpha;
in float v_tone;
out vec4 outColor;

void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float aa = clamp(fwidth(d) * 0.75, 0.06, 0.22);
    float shape = 1.0 - smoothstep(0.5 - aa, 0.5, d);

    vec3 lowCol  = vec3(0.42, 0.44, 0.49);
    vec3 midCol  = vec3(0.76, 0.75, 0.72);
    vec3 highCol = vec3(0.95, 0.93, 0.89);
    vec3 col = v_tone < 0.5
        ? mix(lowCol, midCol, v_tone * 2.0)
        : mix(midCol, highCol, (v_tone - 0.5) * 2.0);
    float a = v_alpha * shape;
    outColor = vec4(col * a, a);
}
