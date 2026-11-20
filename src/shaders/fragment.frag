#version 300 es
precision highp float;

uniform sampler2D u_surfaceTex;
uniform sampler2D u_abyssTex;
uniform sampler2D u_noiseTex;
uniform sampler2D u_abyssImgTex;

uniform vec2 u_res; //캔버스 해상도

uniform vec2 u_mouse;

uniform vec2 u_target;
uniform float u_time;
uniform float u_reveal;
uniform float u_waitProgress;

uniform float u_noiseScale;
uniform float u_noiseFlowSpeed;
uniform float u_warpStrength;
uniform float u_edgeWidth;

uniform vec3 u_vortexWallCol;
uniform vec3 u_abyssDepthCol;

out vec4 outColor;

const float PI = 3.14159265359;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 toPolar(vec2 p) {
    float radius = length(p);
    float angle = atan(p.x, p.y);
    return vec2(angle / (2.0 * PI) + 0.5, radius * 0.5);
}

float overlayBlend(float a, float b) {
    float limit = step(0.5, a);
    return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), limit);
}

// Multi-layer polar parallax vortex sampling seamless u_noiseTex
float computeSurfaceVortex(vec2 p, vec2 mouseOffset, float timeSec, float expand) {
    const int LAYERS = 8;
    const float DEPTH_AMOUNT = 0.85;
    const float FADE_AMOUNT = 1.65;

    float value = 0.0;
    float zoom = mix(1.0, 0.48, expand);
    float holeRadius = 0.24 + expand * 0.78;
    vec2 zoomedP = p * zoom;
    vec2 viewDir = zoomedP - mouseOffset * 0.45 * zoom;
    float normScale = max(u_res.x / u_res.y * 0.68, 1.0);

    for (int i = 0; i < LAYERS; i++) {
        float t = float(i) / float(LAYERS);
        float maxPossible = pow(1.0 - t, FADE_AMOUNT);
        if (value >= maxPossible - 0.001) break;

        float depth = t * DEPTH_AMOUNT;
        vec2 layerP = zoomedP + viewDir * depth;
        float radius = (length(layerP) * 2.0) / normScale;

        float circle = clamp((radius - holeRadius) / 1.05, 0.0, 0.74);
        if (circle <= 0.001) continue;

        vec2 noiseUv = toPolar(layerP);
        noiseUv.y += timeSec * 0.12 - expand * 0.35;
        noiseUv.x += expand * 0.16;
        noiseUv += vec2(t * 0.18, t * 0.35);
        float n = texture(u_noiseTex, noiseUv).r;

        float layerVal = overlayBlend(circle, n);
        layerVal = step(0.5, layerVal) * maxPossible;
        value = max(value, layerVal);
    }

    return value;
}

// 3D pitch/yaw matrix for subtle perspective tilt
mat3 rot2Axis(float pitch, float yaw) {
    float cp = cos(pitch), sp = sin(pitch);
    float cy = cos(yaw), sy = sin(yaw);

    mat3 rx = mat3(
            1.0, 0.0, 0.0,
            0.0, cp, -sp,
            0.0, sp, cp
        );
    mat3 ry = mat3(
            cy, 0.0, sy,
            0.0, 1.0, 0.0,
            -sy, 0.0, cy
        );
    return rx * ry;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_res;
    float aspect = u_res.x / u_res.y;
    float hint = u_waitProgress * (1.0 - u_reveal);

    // Subtle scanline glitch hint near the blind spot before breach
    float glitchShift = 0.0;
    if (hint > 0.01) {
        float lineNoise = step(0.85, hash12(vec2(floor(uv.y * 80.0), floor(u_time * 30.0))));
        glitchShift = lineNoise * hint * 0.025 * sin(u_time * 50.0);
    }

    vec2 pGrid = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 viewAngle = (u_mouse - u_target) * 3.5;

    float mask = 0.0;
    float suctionFactor = 0.0;
    vec2 pullDir = vec2(0.0);

    if (u_reveal > 0.0001) {
        vec2 toTarget = (uv - u_target) * vec2(aspect, 1.0);
        float dist = length(toTarget);

        // Normalize radial distance against farthest viewport corner from u_target
        vec2 farCorner = vec2(
                max(u_target.x, 1.0 - u_target.x) * aspect,
                max(u_target.y, 1.0 - u_target.y)
            );
        float normDist = dist / max(length(farCorner), 1e-4);

        // Domain-warped seamless noise texture sampling
        vec2 baseUv = uv * vec2(aspect, 1.0) * (u_noiseScale * 0.25);
        vec2 flow = vec2(u_time * u_noiseFlowSpeed, -u_time * u_noiseFlowSpeed * 0.7);
        vec2 q = vec2(
                texture(u_noiseTex, baseUv + flow).r,
                texture(u_noiseTex, baseUv * 1.3 + vec2(0.37, 0.71) - flow * 0.8).r
            );
        float warpedNoise = texture(
                u_noiseTex,
                baseUv + (q - 0.5) * (u_warpStrength * 0.22) + flow * 0.5
            ).r;

        // Anchor initial puncture at u_target, then let noise veins dominate spread
        float noiseWeight = mix(0.12, 0.48, smoothstep(0.0, 0.18, normDist));
        float diffusionField = normDist * 0.58 + warpedNoise * noiseWeight;

        // Max theoretical diffusionField = 0.58 + 0.48 = 1.06
        float pad = u_edgeWidth * 2.5;
        float threshold = mix(-pad, 1.06 + pad, u_reveal);
        float signedDiff = diffusionField - threshold;
        float edgeDist = abs(signedDiff);

        // Hard cel-shaded discrete cut between surface and abyss (no rim glow)
        mask = 1.0 - step(0.0, signedDiff);

        // Inward UV suction along target direction + noise domain flow
        pullDir = normalize(toTarget + (q - 0.5) * 0.55 + vec2(1e-5));
        suctionFactor = 1.0 - step(u_edgeWidth * 1.8, edgeDist);
    }

    // Surface layer: discrete stepped vortex + crisp matte particle text
    vec3 surfaceCol = vec3(0.01, 0.01, 0.016);
    if (mask < 0.5) {
        vec2 warp = pullDir * suctionFactor * 0.025;
        vec2 surfUv = uv + warp + vec2(glitchShift, 0.0);
        vec4 surfSample = texture(u_surfaceTex, surfUv);

        vec2 vortexP = pGrid + warp + vec2(glitchShift, 0.0);
        vec2 mouseOffset = (u_mouse - 0.5) * vec2(aspect, 1.0);
        float preExpand = pow(clamp(u_waitProgress, 0.0, 1.0), 2.5) * 0.14;
        float breachExpand = pow(clamp(u_reveal / 0.85, 0.0, 1.0), 1.25);
        float vortexExpand = clamp(preExpand + breachExpand * (1.0 - preExpand), 0.0, 1.0);
        float vortex = computeSurfaceVortex(vortexP, mouseOffset, u_time + hint * 0.45, vortexExpand);

        vec3 vortexDark = vec3(0.01, 0.01, 0.016);
        vec3 vortexBg = mix(vortexDark, u_vortexWallCol * 0.72, vortex);
        surfaceCol = vortexBg * (1.0 - surfSample.a) + surfSample.rgb;
    }

    // Matte cel Abyss Layer: flat dark void with discrete Z-depth shadow & crisp text
    vec3 abyssCol = vec3(0.02, 0.02, 0.028);
    if (mask > 0.5) {
        float yaw = -viewAngle.x * 0.12;
        float pitch = viewAngle.y * 0.12;

        mat3 cardRot = rot2Axis(pitch, yaw);
        vec3 axisU = cardRot * vec3(1.0, 0.0, 0.0);
        vec3 axisV = cardRot * vec3(0.0, 1.0, 0.0);
        vec3 cardNormal = cardRot * vec3(0.0, 0.0, -1.0);

        // Camera ray in aspect-corrected viewport coordinates (focal = 1.45)
        vec3 rd = vec3(pGrid, 1.45);
        float denom = dot(rd, cardNormal);

        vec4 frontSample = vec4(0.0);
        float depthAlpha = 0.0;

        if (abs(denom) > 1e-4) {
            vec3 planeCenter = vec3(0.0, 0.0, 1.45);
            float t0 = dot(planeCenter, cardNormal) / denom;
            if (t0 > 0.0) {
                vec3 rel0 = rd * t0 - planeCenter;
                vec2 frontUv = vec2(
                    dot(rel0, axisU) / aspect + 0.5,
                    dot(rel0, axisV) + 0.5
                );
                if (frontUv.x > 0.0 && frontUv.x < 1.0 && frontUv.y > 0.0 && frontUv.y < 1.0) {
                    frontSample = texture(u_abyssTex, frontUv);
                }

                vec2 depthStepUv = vec2(
                    -dot(rd, axisU) / (denom * aspect),
                    -dot(rd, axisV) / denom
                ) + viewAngle * 0.25;

                for (int i = 1; i <= 4; i++) {
                    vec2 sliceUv = frontUv + depthStepUv * (float(i) * 0.03);
                    if (sliceUv.x > 0.0 && sliceUv.x < 1.0 && sliceUv.y > 0.0 && sliceUv.y < 1.0) {
                        depthAlpha = max(depthAlpha, texture(u_abyssTex, sliceUv).a);
                    }
                }
            }
        }

        vec4 abyssImgSample = texture(u_abyssImgTex, uv);
        abyssCol = abyssCol * (1.0 - abyssImgSample.a) + abyssImgSample.rgb;
        abyssCol = mix(abyssCol, u_abyssDepthCol, step(0.35, depthAlpha));
        abyssCol = abyssCol * (1.0 - frontSample.a) + frontSample.rgb;
    }

    vec3 finalCol = mix(surfaceCol, abyssCol, mask);
    outColor = vec4(finalCol, 1.0);
}
