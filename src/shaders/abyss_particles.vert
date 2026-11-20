#version 300 es
layout(location = 0) in vec2 a_anchor;
layout(location = 1) in vec2 a_offsetH;
layout(location = 2) in vec2 a_dir;
layout(location = 3) in vec4 a_meta;

uniform vec2 u_cssRes;
uniform float u_dpr;
uniform float u_time;
uniform float u_reveal;
uniform sampler2D u_noiseTex;

out float v_alpha;
out float v_tone;

void main() {
    float clampedReveal = clamp(u_reveal, 0.0, 1.0);
    float scatter = pow(1.0 - clampedReveal, 2.0) * 32.0;
    float scaleH = min(u_cssRes.y, u_cssRes.x * 0.65);
    vec2 basePos = a_anchor * u_cssRes + a_offsetH * scaleH;
    vec2 flowUv =
        (basePos / max(u_cssRes.y, 1.0)) * 0.55 +
        vec2(u_time * 0.032, -u_time * 0.024);
    float n0 = textureLod(u_noiseTex, flowUv, 0.0).r;
    float nx = textureLod(u_noiseTex, flowUv + vec2(0.015, 0.0), 0.0).r;
    float ny = textureLod(u_noiseTex, flowUv + vec2(0.0, 0.015), 0.0).r;
    vec2 flow = vec2(ny - n0, -(nx - n0)) * 28.0;
    vec2 swirlDir = normalize(
        a_dir + vec2(-a_dir.y, a_dir.x) * 0.45 + flow * 0.35 + vec2(1e-4)
    );
    vec2 pos = basePos + flow + swirlDir * scatter;
    vec2 ndc = (pos / max(u_cssRes, vec2(1.0))) * 2.0 - 1.0;
    gl_Position = vec4(ndc, 0.0, 1.0);
    float sizeScale = clamp(scaleH / 900.0, 0.52, 1.25);
    gl_PointSize = a_meta.x * sizeScale * u_dpr;
    v_alpha = a_meta.z;
    v_tone = a_meta.w;
}
