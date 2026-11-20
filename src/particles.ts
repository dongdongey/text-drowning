import type { AbyssImageConfig, Config } from "./config";

const KOREAN_FONT_STACK =
    '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const NOISE_FIELD_SIZE = 128;

class NoiseField {
    private readonly data = new Float32Array(
        NOISE_FIELD_SIZE * NOISE_FIELD_SIZE,
    );

    constructor(image: HTMLImageElement) {
        const canvas = document.createElement("canvas");
        canvas.width = NOISE_FIELD_SIZE;
        canvas.height = NOISE_FIELD_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("2D canvas context is not supported.");
        }
        ctx.drawImage(image, 0, 0, NOISE_FIELD_SIZE, NOISE_FIELD_SIZE);
        const imgData = ctx.getImageData(
            0,
            0,
            NOISE_FIELD_SIZE,
            NOISE_FIELD_SIZE,
        ).data;
        const count = NOISE_FIELD_SIZE * NOISE_FIELD_SIZE;
        for (let i = 0; i < count; i++) {
            this.data[i] = imgData[i * 4] / 255;
        }
    }

    sample(u: number, v: number): number {
        const gx = u * NOISE_FIELD_SIZE;
        const gy = v * NOISE_FIELD_SIZE;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const tx = gx - x0;
        const ty = gy - y0;
        const mask = NOISE_FIELD_SIZE - 1;
        const ix0 = x0 & mask;
        const iy0 = y0 & mask;
        const ix1 = (ix0 + 1) & mask;
        const iy1 = (iy0 + 1) & mask;
        const r0 = iy0 * NOISE_FIELD_SIZE;
        const r1 = iy1 * NOISE_FIELD_SIZE;
        const v00 = this.data[r0 + ix0];
        const v10 = this.data[r0 + ix1];
        const v01 = this.data[r1 + ix0];
        const v11 = this.data[r1 + ix1];
        const a = v00 + (v10 - v00) * tx;
        const b = v01 + (v11 - v01) * tx;
        return a + (b - a) * ty;
    }
}

export interface DrawCenteredTextOptions {
    maxWidthRatio?: number;
    fontScale?: number;
    maxFontSize?: number;
    lineHeightRatio?: number;
    lineColors?: string[];
    transparentBackground?: boolean;
}

export interface ParticleMouseInput {
    x: number;
    y: number;
    vx: number;
    vy: number;
    active: boolean;
}

export function drawCenteredText(
    ctx: CanvasRenderingContext2D,
    textOrLines: string | string[],
    width: number,
    height: number,
    {
        maxWidthRatio = 0.78,
        fontScale = 0.17,
        maxFontSize = 190,
        lineHeightRatio = 1.25,
        lineColors,
        transparentBackground = false,
    }: DrawCenteredTextOptions = {},
): void {
    if (transparentBackground) {
        ctx.clearRect(0, 0, width, height);
    } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
    }

    if (width <= 0 || height <= 0) {
        return;
    }

    const lines = Array.isArray(textOrLines)
        ? textOrLines
        : String(textOrLines).split("\n");
    const colors =
        lineColors && lineColors.length > 0 ? lineColors : ["#fff"];

    let fontSize = Math.min(width * fontScale, height * 0.22, maxFontSize);
    ctx.font = `900 ${fontSize}px ${KOREAN_FONT_STACK}`;

    const maxLineWidth = Math.max(
        ...lines.map((line) => ctx.measureText(line).width),
        1,
    );
    const maxAllowedWidth = width * maxWidthRatio;
    if (maxLineWidth > maxAllowedWidth) {
        fontSize = Math.floor(fontSize * (maxAllowedWidth / maxLineWidth));
    }

    const maxAllowedHeight = height * 0.76;
    if (lines.length * fontSize * lineHeightRatio > maxAllowedHeight) {
        fontSize = Math.floor(
            maxAllowedHeight / (lines.length * lineHeightRatio),
        );
    }

    ctx.font = `900 ${fontSize}px ${KOREAN_FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lineHeight = fontSize * lineHeightRatio;
    const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;

    for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = colors[Math.min(i, colors.length - 1)];
        ctx.fillText(lines[i], width / 2, startY + i * lineHeight);
    }
}

export class ParticleSystem {
    readonly config: Config;
    readonly renderBuffer: Float32Array;
    private readonly noise: NoiseField;
    private readonly ox: Float32Array;
    private readonly oy: Float32Array;
    private readonly x: Float32Array;
    private readonly y: Float32Array;
    private readonly vx: Float32Array;
    private readonly vy: Float32Array;
    private readonly vis: Float32Array;
    private readonly size: Float32Array;
    private readonly tone: Float32Array;
    private readonly grain: Float32Array;
    private readonly alpha: Float32Array;
    width = 0;
    height = 0;
    count = 0;

    constructor(config: Config, noiseImage: HTMLImageElement) {
        this.config = config;
        this.noise = new NoiseField(noiseImage);
        const n = config.particleCount;
        this.renderBuffer = new Float32Array(n * 5);
        this.ox = new Float32Array(n);
        this.oy = new Float32Array(n);
        this.x = new Float32Array(n);
        this.y = new Float32Array(n);
        this.vx = new Float32Array(n);
        this.vy = new Float32Array(n);
        this.vis = new Float32Array(n);
        this.size = new Float32Array(n);
        this.tone = new Float32Array(n);
        this.grain = new Float32Array(n);
        this.alpha = new Float32Array(n);
    }

    resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.sampleTextPoints(this.config.surfaceText, width, height);
    }

    private sampleTextPoints(
        text: string | string[],
        targetWidth: number,
        targetHeight: number,
    ): void {
        if (targetWidth <= 0 || targetHeight <= 0) {
            this.count = 0;
            return;
        }

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const tCtx = tempCanvas.getContext("2d");
        if (!tCtx) {
            throw new Error("2D canvas context is not supported.");
        }

        drawCenteredText(tCtx, text, targetWidth, targetHeight, {
            maxWidthRatio: 0.78,
            fontScale: 0.17,
            maxFontSize: 190,
            lineHeightRatio: 1.24,
        });

        const imgData = tCtx.getImageData(0, 0, targetWidth, targetHeight).data;
        let filledCount = 0;
        const step = 2;

        for (let y = 0; y < targetHeight; y += step) {
            for (let x = 0; x < targetWidth; x += step) {
                if (imgData[(y * targetWidth + x) * 4] > 96) {
                    filledCount += 1;
                }
            }
        }

        if (filledCount === 0) {
            this.count = 0;
            return;
        }

        const n = this.config.particleCount;
        const filledArea = filledCount * 4;
        const spacing = Math.max(
            2.0,
            Math.sqrt((filledArea * 1.06) / (n * 0.8660254)),
        );
        const rowStep = spacing * 0.8660254;
        const candidates: Array<{ x: number; y: number; isEdge: boolean }> = [];
        const isFilled = (sx: number, sy: number): boolean =>
            sx >= 0 &&
            sx < targetWidth &&
            sy >= 0 &&
            sy < targetHeight &&
            imgData[(sy * targetWidth + sx) * 4] > 80;

        for (let row = 0; row * rowStep < targetHeight; row++) {
            const baseY = row * rowStep;
            const xOffset = (row & 1) === 1 ? spacing * 0.5 : 0;
            for (let col = 0; col * spacing < targetWidth; col++) {
                const px =
                    col * spacing +
                    xOffset +
                    (Math.random() - 0.5) * spacing * 0.36;
                const py = baseY + (Math.random() - 0.5) * spacing * 0.36;
                const sx = Math.min(
                    targetWidth - 1,
                    Math.max(0, Math.round(px)),
                );
                const sy = Math.min(
                    targetHeight - 1,
                    Math.max(0, Math.round(py)),
                );
                if (!isFilled(sx, sy)) {
                    continue;
                }
                const isEdge =
                    !isFilled(sx - 2, sy) ||
                    !isFilled(sx + 2, sy) ||
                    !isFilled(sx, sy - 2) ||
                    !isFilled(sx, sy + 2);
                candidates.push({ x: px, y: py, isEdge });
            }
        }

        if (candidates.length === 0) {
            this.count = 0;
            return;
        }

        this.count = Math.min(candidates.length, n);
        for (let i = 0; i < this.count; i++) {
            const pt =
                candidates.length > n
                    ? candidates[Math.floor((i * candidates.length) / this.count)]
                    : candidates[i];
            const ox = pt.x;
            // Store directly in WebGL bottom-left CSS pixels
            const oy = targetHeight - pt.y;

            this.ox[i] = ox;
            this.oy[i] = oy;
            this.x[i] = ox;
            this.y[i] = oy;
            this.vx[i] = 0;
            this.vy[i] = 0;
            this.vis[i] = 0;
            this.size[i] = pt.isEdge
                ? 2.1 + Math.random() * 1.2
                : 1.7 + Math.random() * 1.4;
            this.tone[i] = pt.isEdge
                ? 0.82 + Math.random() * 0.18
                : 0.42 + Math.random() * 0.40;
            this.grain[i] = Math.random();
            this.alpha[i] = 0.80 + Math.random() * 0.20;
        }
    }

    update(
        timeSec: number,
        dt: number,
        mouse: ParticleMouseInput,
        sinkProgress = 0,
    ): number {
        const n = this.count;
        if (n === 0) {
            return 0;
        }

        const { mouseRadius, swayForce, springReturn, damping } = this.config;
        const step60 = dt * 60.0;
        const visRise = 1.0 - Math.pow(1.0 - 0.35, step60);
        const visDecay = Math.pow(0.91, step60);
        const damp = Math.pow(damping, step60);

        const maxR = mouseRadius * 1.55;
        const maxRSq = maxR * maxR;
        const maxSwipe = 24;
        const clampedVx = Math.max(
            -maxSwipe,
            Math.min(maxSwipe, mouse.vx / 60.0),
        );
        const clampedVy = Math.max(
            -maxSwipe,
            Math.min(maxSwipe, mouse.vy / 60.0),
        );
        const cursorSpeed = Math.hypot(clampedVx, clampedVy);
        const hasWake = cursorSpeed > 0.5;
        const wakeDirX = hasWake ? -clampedVx / cursorSpeed : 0;
        const wakeDirY = hasWake ? -clampedVy / cursorSpeed : 0;
        const wakeStrength = Math.min(0.32, cursorSpeed * 0.018);

        const cx = this.width * 0.5;
        const cy = this.height * 0.5;
        const spring = springReturn * (1.0 - Math.min(1, sinkProgress * 1.25));
        const pull = sinkProgress * 4.5;
        const swirl = sinkProgress * 3.2;
        const alphaScale = 1.0 - sinkProgress * 0.85;

        const {
            ox,
            oy,
            x,
            y,
            vx,
            vy,
            vis,
            size,
            tone,
            grain,
            alpha,
            noise,
            renderBuffer,
        } = this;
        let visibleCount = 0;

        for (let i = 0; i < n; i++) {
            let px = x[i];
            let py = y[i];
            let pvx = vx[i];
            let pvy = vy[i];
            let pvis = vis[i];

            const fx = px * 0.0045 + timeSec * 0.05;
            const fy = py * 0.0045 - timeSec * 0.035;
            const eps = 0.015;
            const fn0 = noise.sample(fx, fy);
            const fnx = noise.sample(fx + eps, fy);
            const fny = noise.sample(fx, fy + eps);
            const flowX = (fny - fn0) * 26.0;
            const flowY = -(fnx - fn0) * 26.0;

            let targetVis = 0;
            if (mouse.active) {
                const dx = px - mouse.x;
                const dy = py - mouse.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < maxRSq) {
                    const dist = Math.sqrt(distSq);
                    const n1 = noise.sample(
                        px * 0.0045 + timeSec * 0.04,
                        py * 0.0045 - timeSec * 0.03,
                    );
                    const n2 = noise.sample(
                        px * 0.013 - timeSec * 0.025,
                        py * 0.013 + timeSec * 0.035,
                    );
                    const wakeBoost =
                        hasWake && dist > 0.1
                            ? 1.0 +
                              Math.max(
                                  0,
                                  (dx / dist) * wakeDirX +
                                      (dy / dist) * wakeDirY,
                              ) *
                                  wakeStrength
                            : 1.0;
                    const localRadius =
                        mouseRadius *
                        (0.58 + n1 * 0.62 + (n2 - 0.5) * 0.28) *
                        wakeBoost;

                    if (dist < localRadius) {
                        const falloff = 1.0 - dist / localRadius;
                        const grainyFalloff = Math.max(
                            0,
                            Math.min(1, (falloff - grain[i] * 0.18) / 0.82),
                        );
                        targetVis = Math.pow(grainyFalloff, 0.85);

                        if (dist > 0.1) {
                            const nx = dx / dist;
                            const ny = dy / dist;
                            const smoothFalloff = falloff * falloff;
                            const curlBias = (n2 - 0.5) * 0.45;

                            pvx +=
                                (clampedVx * swayForce +
                                    nx * 0.75 -
                                    ny * (0.3 + curlBias)) *
                                smoothFalloff *
                                step60;
                            pvy +=
                                (clampedVy * swayForce +
                                    ny * 0.75 +
                                    nx * (0.3 + curlBias)) *
                                smoothFalloff *
                                step60;
                        }
                    }
                }
            }

            if (targetVis > pvis) {
                pvis += (targetVis - pvis) * visRise;
            } else {
                pvis *= visDecay;
            }

            if (sinkProgress > 0.001) {
                const toCx = cx - px;
                const toCy = cy - py;
                const cDist = Math.hypot(toCx, toCy) + 1e-4;
                pvx +=
                    ((toCx / cDist) * pull -
                        (toCy / cDist) * swirl +
                        flowX * 0.18 * sinkProgress) *
                    step60;
                pvy +=
                    ((toCy / cDist) * pull +
                        (toCx / cDist) * swirl +
                        flowY * 0.18 * sinkProgress) *
                    step60;
            }

            pvx += (ox[i] + flowX - px) * spring * step60;
            pvy += (oy[i] + flowY - py) * spring * step60;

            pvx *= damp;
            pvy *= damp;
            px += pvx * step60;
            py += pvy * step60;

            x[i] = px;
            y[i] = py;
            vx[i] = pvx;
            vy[i] = pvy;
            vis[i] = pvis;

            const renderAlpha = Math.min(1, alpha[i] * pvis * alphaScale);
            if (renderAlpha < 0.015) {
                continue;
            }

            const out = visibleCount * 5;
            renderBuffer[out] = px;
            renderBuffer[out + 1] = py;
            renderBuffer[out + 2] = size[i];
            renderBuffer[out + 3] = renderAlpha;
            renderBuffer[out + 4] = tone[i];
            visibleCount += 1;
        }

        return visibleCount;
    }
}

export interface AbyssImageEntry {
    config: AbyssImageConfig;
    image: HTMLImageElement;
}

export interface SampledAbyssBuffer {
    data: Float32Array;
    count: number;
}

const ABYSS_FLOATS_PER_PARTICLE = 10;

export function sampleAbyssParticles(
    entries: AbyssImageEntry[],
    sampleHeight = 400,
): SampledAbyssBuffer {
    const out: number[] = [];

    for (const { config, image } of entries) {
        const natW = image.naturalWidth || image.width || 1;
        const natH = image.naturalHeight || image.height || 1;
        const aspect = natW / natH;
        const sampleH = sampleHeight;
        const sampleW = Math.max(1, Math.round(sampleH * aspect));

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = sampleW;
        tempCanvas.height = sampleH;
        const tCtx = tempCanvas.getContext("2d");
        if (!tCtx) {
            throw new Error("2D canvas context is not supported.");
        }

        tCtx.clearRect(0, 0, sampleW, sampleH);
        tCtx.drawImage(image, 0, 0, sampleW, sampleH);

        const imgData = tCtx.getImageData(0, 0, sampleW, sampleH).data;
        const readLum = (
            cx: number,
            cy: number,
        ): { lum: number; alpha: number } => {
            let lumSum = 0;
            let alphaSum = 0;
            let count = 0;
            for (let oy = -1; oy <= 1; oy++) {
                const sy = cy + oy;
                if (sy < 0 || sy >= sampleH) continue;
                for (let ox = -1; ox <= 1; ox++) {
                    const sx = cx + ox;
                    if (sx < 0 || sx >= sampleW) continue;
                    const idx = (sy * sampleW + sx) * 4;
                    const a = imgData[idx + 3] / 255;
                    let l =
                        (0.299 * imgData[idx] +
                            0.587 * imgData[idx + 1] +
                            0.114 * imgData[idx + 2]) /
                        255;
                    if (config.invert) {
                        l = 1.0 - l;
                    }
                    lumSum += l * a;
                    alphaSum += a;
                    count += 1;
                }
            }
            return count > 0
                ? { lum: lumSum / count, alpha: alphaSum / count }
                : { lum: 0, alpha: 0 };
        };

        let activeCount = 0;
        const step = 2;
        for (let y = 0; y < sampleH; y += step) {
            for (let x = 0; x < sampleW; x += step) {
                const idx = (y * sampleW + x) * 4;
                const a = imgData[idx + 3] / 255;
                if (a < 0.15) {
                    continue;
                }
                let l =
                    (0.299 * imgData[idx] +
                        0.587 * imgData[idx + 1] +
                        0.114 * imgData[idx + 2]) /
                    255;
                if (config.invert) {
                    l = 1.0 - l;
                }
                if (l * a >= 0.15) {
                    activeCount += 1;
                }
            }
        }

        if (activeCount === 0) {
            continue;
        }

        const activeArea = activeCount * 4;
        const spacing = Math.max(
            2.0,
            Math.sqrt(activeArea / (config.particleCount * 0.8660254)),
        );
        const rowStep = spacing * 0.8660254;
        const gamma = config.gamma ?? 2.2;
        const glY = 1.0 - config.y;
        const anchorX = config.anchorX ?? 0.5;
        const glAnchorY = 1.0 - (config.anchorY ?? 0.5);

        for (let row = 0; row * rowStep < sampleH; row++) {
            const baseY = row * rowStep;
            const xOffset = (row & 1) === 1 ? spacing * 0.5 : 0;
            for (let col = 0; col * spacing < sampleW; col++) {
                const px =
                    col * spacing +
                    xOffset +
                    (Math.random() - 0.5) * spacing * 0.2;
                const py = baseY + (Math.random() - 0.5) * spacing * 0.2;
                const sx = Math.min(
                    sampleW - 1,
                    Math.max(0, Math.round(px)),
                );
                const sy = Math.min(
                    sampleH - 1,
                    Math.max(0, Math.round(py)),
                );

                const { lum: avgLum, alpha: avgAlpha } = readLum(sx, sy);
                if (avgAlpha < 0.15) {
                    continue;
                }

                const normLum = Math.max(0, (avgLum - 0.15) / 0.85);
                const c = Math.pow(normLum, gamma * 0.5);
                if (c < 0.08) {
                    continue;
                }

                let tone: number;
                let size: number;
                let alpha: number;
                if (c < 0.34) {
                    tone = 0.15;
                    size = 1.4 + c * 1.4;
                    alpha = 0.72;
                } else if (c < 0.68) {
                    tone = 0.55;
                    size = 2.1 + c * 1.5;
                    alpha = 0.88;
                } else {
                    tone = 1.0;
                    size = 2.9 + c * 1.3;
                    alpha = 0.98;
                }

                const nx = Math.min(1, Math.max(0, px / sampleW));
                const ny = Math.min(1, Math.max(0, py / sampleH));
                const glNy = 1.0 - ny;

                const offsetHx = (nx - anchorX) * aspect * config.heightRatio;
                const offsetHy = (glNy - glAnchorY) * config.heightRatio;
                const rawDx = (nx - 0.5) * aspect;
                const rawDy = glNy - 0.5;
                const dist = Math.hypot(rawDx, rawDy) + 1e-4;

                out.push(
                    config.x,
                    glY,
                    offsetHx,
                    offsetHy,
                    rawDx / dist,
                    rawDy / dist,
                    size,
                    Math.random() * Math.PI * 2,
                    alpha,
                    tone,
                );
            }
        }
    }

    return {
        data: new Float32Array(out),
        count: out.length / ABYSS_FLOATS_PER_PARTICLE,
    };
}
