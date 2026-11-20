#version 300 es
layout(location = 0) in vec4 a_particle;

uniform vec2 u_cssRes;
uniform float u_dpr;

out float v_alpha;

void main() {
    vec2 ndc = (a_particle.xy / max(u_cssRes, vec2(1.0))) * 2.0 - 1.0;
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = a_particle.z * u_dpr;
    v_alpha = a_particle.w;
}
