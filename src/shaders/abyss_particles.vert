#version 300 es
layout(location = 0) in vec2 a_anchor;
layout(location = 1) in vec2 a_offsetH;
layout(location = 2) in vec2 a_dir;
layout(location = 3) in vec3 a_meta;

uniform vec2 u_cssRes;
uniform float u_dpr;
uniform float u_time;
uniform float u_reveal;

out float v_alpha;

void main() {
    float clampedReveal = clamp(u_reveal, 0.0, 1.0);
    float scatter = pow(1.0 - clampedReveal, 2.0) * 32.0;
    vec2 basePos = a_anchor * u_cssRes + a_offsetH * u_cssRes.y;
    vec2 shimmer = vec2(
        cos(u_time * 2.4 + a_meta.y) * 0.85,
        -sin(u_time * 2.0 + a_meta.y) * 0.85
    );
    vec2 pos = basePos + shimmer + a_dir * scatter;
    vec2 ndc = (pos / max(u_cssRes, vec2(1.0))) * 2.0 - 1.0;
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = a_meta.x * u_dpr;
    v_alpha = a_meta.z;
}
