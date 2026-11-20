import type { AbyssImageConfig, Config, Point2D } from "./config";

const KOREAN_FONT_STACK =
    '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

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
    private readonly ox: Float32Array;
    private readonly oy: Float32Array;
    private readonly x: Float32Array;
    private readonly y: Float32Array;
    private readonly vx: Float32Array;
    private readonly vy: Float32Array;
    private readonly vis: Float32Array;
    private readonly size: Float32Array;
    private readonly phase: Float32Array;
    private readonly alpha: Float32Array;
    width = 0;
    height = 0;
    count = 0;

    constructor(config: Config) {
        this.config = config;
        const n = config.particleCount;
        this.renderBuffer = new Float32Array(n * 4);
        this.ox = new Float32Array(n);
        this.oy = new Float32Array(n);
        this.x = new Float32Array(n);
        this.y = new Float32Array(n);
        this.vx = new Float32Array(n);
        this.vy = new Float32Array(n);
        this.vis = new Float32Array(n);
        this.size = new Float32Array(n);
        this.phase = new Float32Array(n);
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
        const validPoints: Point2D[] = [];
        const step = 2;

        for (let y = 0; y < targetHeight; y += step) {
            for (let x = 0; x < targetWidth; x += step) {
                const idx = (y * targetWidth + x) * 4;
                if (imgData[idx] > 96) {
                    validPoints.push({ x, y });
                }
            }
        }

        if (validPoints.length === 0) {
            this.count = 0;
            return;
        }

        const n = this.config.particleCount;
        this.count = n;
        for (let i = 0; i < n; i++) {
            const pt =
                validPoints[Math.floor(Math.random() * validPoints.length)];
            const ox = pt.x + (Math.random() - 0.5) * 1.1;
            // Store directly in WebGL bottom-left CSS pixels
            const oy = targetHeight - (pt.y + (Math.random() - 0.5) * 1.1);

            this.ox[i] = ox;
            this.oy[i] = oy;
            this.x[i] = ox;
            this.y[i] = oy;
            this.vx[i] = 0;
            this.vy[i] = 0;
            this.vis[i] = 0;
            this.size[i] = 1.5 + Math.random() * 1.5;
            this.phase[i] = Math.random() * Math.PI * 2;
            this.alpha[i] = 0.78 + Math.random() * 0.22;
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

        const rSq = mouseRadius * mouseRadius;
        const maxSwipe = 24;
        const clampedVx = Math.max(
            -maxSwipe,
            Math.min(maxSwipe, mouse.vx / 60.0),
        );
        const clampedVy = Math.max(
            -maxSwipe,
            Math.min(maxSwipe, mouse.vy / 60.0),
        );
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
            phase,
            alpha,
            renderBuffer,
        } = this;
        let visibleCount = 0;

        for (let i = 0; i < n; i++) {
            let px = x[i];
            let py = y[i];
            let pvx = vx[i];
            let pvy = vy[i];
            let pvis = vis[i];

            let targetVis = 0;
            if (mouse.active) {
                const dx = px - mouse.x;
                const dy = py - mouse.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < rSq) {
                    const dist = Math.sqrt(distSq);
                    const falloff = 1.0 - dist / mouseRadius;
                    targetVis = Math.pow(falloff, 1.25);

                    if (dist > 0.1) {
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const smoothFalloff = falloff * falloff;

                        pvx +=
                            (clampedVx * swayForce + nx * 0.75 - ny * 0.3) *
                            smoothFalloff *
                            step60;
                        pvy +=
                            (clampedVy * swayForce + ny * 0.75 + nx * 0.3) *
                            smoothFalloff *
                            step60;
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
                pvx += ((toCx / cDist) * pull - (toCy / cDist) * swirl) * step60;
                pvy += ((toCy / cDist) * pull + (toCx / cDist) * swirl) * step60;
            }

            const ph = phase[i];
            const driftX = Math.cos(timeSec * 1.6 + ph) * 0.14;
            const driftY = Math.sin(timeSec * 1.3 + ph) * 0.14;

            pvx += (ox[i] + driftX - px) * spring * step60;
            pvy += (oy[i] + driftY - py) * spring * step60;

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

            const out = visibleCount * 4;
            renderBuffer[out] = px;
            renderBuffer[out + 1] = py;
            renderBuffer[out + 2] = size[i];
            renderBuffer[out + 3] = renderAlpha;
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

interface ImageSampleCandidate {
    x: number;
    y: number;
    lum: number;
}

const ABYSS_FLOATS_PER_PARTICLE = 9;

export function sampleAbyssParticles(
    entries: AbyssImageEntry[],
    sampleHeight = 400,
): SampledAbyssBuffer {
    const totalRequested = entries.reduce(
        (sum, entry) => sum + entry.config.particleCount,
        0,
    );
    const data = new Float32Array(totalRequested * ABYSS_FLOATS_PER_PARTICLE);
    let written = 0;

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
        const candidates: ImageSampleCandidate[] = [];
        const cdf: number[] = [];
        let totalWeight = 0;
        const step = 2;
        const gamma = config.gamma ?? 2.2;

        for (let y = 0; y < sampleH; y += step) {
            for (let x = 0; x < sampleW; x += step) {
                const idx = (y * sampleW + x) * 4;
                const a = imgData[idx + 3] / 255;
                if (a < 0.1) {
                    continue;
                }

                let lum =
                    (0.299 * imgData[idx] +
                        0.587 * imgData[idx + 1] +
                        0.114 * imgData[idx + 2]) /
                    255;
                if (config.invert) {
                    lum = 1.0 - lum;
                }
                lum *= a;

                const normLum = Math.max(0, (lum - 0.18) / 0.82);
                const weight = Math.pow(normLum, gamma);

                if (weight > 0.005) {
                    totalWeight += weight;
                    candidates.push({ x, y, lum });
                    cdf.push(totalWeight);
                }
            }
        }

        if (candidates.length === 0 || totalWeight <= 0) {
            continue;
        }

        const glY = 1.0 - config.y;
        const anchorX = config.anchorX ?? 0.5;
        const glAnchorY = 1.0 - (config.anchorY ?? 0.5);

        for (let i = 0; i < config.particleCount; i++) {
            const target = Math.random() * totalWeight;
            let lo = 0;
            let hi = cdf.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (cdf[mid] < target) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }

            const pt = candidates[lo];
            const nx = Math.min(
                1,
                Math.max(0, (pt.x + (Math.random() - 0.5) * 1.8) / sampleW),
            );
            const ny = Math.min(
                1,
                Math.max(0, (pt.y + (Math.random() - 0.5) * 1.8) / sampleH),
            );
            const glNy = 1.0 - ny;

            const offsetHx = (nx - anchorX) * aspect * config.heightRatio;
            const offsetHy = (glNy - glAnchorY) * config.heightRatio;
            const rawDx = (nx - 0.5) * aspect;
            const rawDy = glNy - 0.5;
            const dist = Math.hypot(rawDx, rawDy) + 1e-4;

            const base = written * ABYSS_FLOATS_PER_PARTICLE;
            data[base] = config.x;
            data[base + 1] = glY;
            data[base + 2] = offsetHx;
            data[base + 3] = offsetHy;
            data[base + 4] = rawDx / dist;
            data[base + 5] = rawDy / dist;
            data[base + 6] = 1.0 + pt.lum * 1.4;
            data[base + 7] = Math.random() * Math.PI * 2;
            data[base + 8] = 0.45 + pt.lum * 0.55;
            written += 1;
        }
    }

    return {
        data:
            written === totalRequested
                ? data
                : data.subarray(0, written * ABYSS_FLOATS_PER_PARTICLE),
        count: written,
    };
}
