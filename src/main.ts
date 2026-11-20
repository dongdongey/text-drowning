import noiseTextureUrl from "./assets/noise.png";
import { CONFIG } from "./config";
import { ParticleSystem, sampleAbyssParticles } from "./particles";
import { Renderer } from "./renderer";
import { SHADERS } from "./shaders";

interface MouseState {
    x: number;
    y: number;
    moveDx: number;
    moveDy: number;
    vx: number;
    vy: number;
    active: boolean;
    smoothSpeed: number;
    idleTimer: number;
    noMoveTimer: number;
    reveal: number;
}

const glCanvas = document.getElementById("glCanvas");

let width = window.innerWidth;
let height = window.innerHeight;

const mouse: MouseState = {
    x: 0,
    y: 0,
    moveDx: 0,
    moveDy: 0,
    vx: 0,
    vy: 0,
    active: false,
    smoothSpeed: 0,
    idleTimer: 0,
    noMoveTimer: 0,
    reveal: 0,
};

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

async function init(): Promise<void> {
    if (!(glCanvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing #glCanvas element.");
    }

    const [noiseImage, ...abyssImages] = await Promise.all([
        loadImage(noiseTextureUrl),
        ...CONFIG.abyssImages.map((item) => loadImage(item.src)),
    ]);

    const particles = new ParticleSystem(CONFIG);
    const abyssParticles = sampleAbyssParticles(
        CONFIG.abyssImages.map((config, idx) => ({
            config,
            image: abyssImages[idx],
        })),
    );
    const renderer = new Renderer(
        glCanvas,
        CONFIG,
        SHADERS,
        noiseImage,
        abyssParticles,
    );

    function handleResize(): void {
        width = window.innerWidth;
        height = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        particles.resize(width, height);
        renderer.resize(width, height, dpr);
    }

    window.addEventListener("resize", handleResize);
    handleResize();

    window.addEventListener("mousemove", (e: MouseEvent) => {
        const glX = e.clientX;
        const glY = height - e.clientY;
        if (!mouse.active) {
            mouse.x = glX;
            mouse.y = glY;
            mouse.moveDx = 0;
            mouse.moveDy = 0;
            mouse.active = true;
            return;
        }
        mouse.moveDx += glX - mouse.x;
        mouse.moveDy += glY - mouse.y;
        mouse.x = glX;
        mouse.y = glY;
    });

    function resetToInitialState(): void {
        mouse.active = false;
        mouse.x = 0;
        mouse.y = 0;
        mouse.moveDx = 0;
        mouse.moveDy = 0;
        mouse.vx = 0;
        mouse.vy = 0;
        mouse.smoothSpeed = 0;
        mouse.idleTimer = 0;
        mouse.noMoveTimer = 0;
    }

    let lastTime = performance.now();

    function updateLoop(now: number): void {
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        const timeSec = now / 1000;

        const movedThisFrame = mouse.moveDx !== 0 || mouse.moveDy !== 0;
        const instVx = dt > 1e-4 ? mouse.moveDx / dt : 0;
        const instVy = dt > 1e-4 ? mouse.moveDy / dt : 0;
        mouse.moveDx = 0;
        mouse.moveDy = 0;

        const velAlpha = 1.0 - Math.exp(-15.0 * dt);
        mouse.vx += (instVx - mouse.vx) * velAlpha;
        mouse.vy += (instVy - mouse.vy) * velAlpha;
        mouse.smoothSpeed = Math.hypot(mouse.vx, mouse.vy);

        if (movedThisFrame) {
            mouse.noMoveTimer = 0;
        } else if (mouse.active) {
            mouse.noMoveTimer += dt;
            if (mouse.noMoveTimer >= CONFIG.autoResetSec) {
                resetToInitialState();
            }
        }

        const mouseGlX = width > 0 ? mouse.x / width : 0.5;
        const mouseGlY = height > 0 ? mouse.y / height : 0.5;
        const distToTarget = Math.hypot(
            mouseGlX - CONFIG.blindSpot.x,
            mouseGlY - CONFIG.blindSpot.y,
        );

        const isInZone = mouse.active && distToTarget < CONFIG.zoneRadius;
        const isStill =
            !movedThisFrame && mouse.smoothSpeed < CONFIG.stillSpeedThreshold;

        if (isInZone && isStill) {
            mouse.idleTimer += dt;
            if (mouse.idleTimer >= CONFIG.revealDelaySec) {
                mouse.reveal = Math.min(
                    1.0,
                    mouse.reveal + dt * CONFIG.spreadSpeed,
                );
            } else {
                mouse.reveal = Math.max(
                    0.0,
                    mouse.reveal - dt * CONFIG.closeSpeed,
                );
            }
        } else {
            mouse.idleTimer = 0;
            mouse.reveal = Math.max(0.0, mouse.reveal - dt * CONFIG.closeSpeed);
        }

        const waitProgress = Math.min(
            1.0,
            mouse.idleTimer / CONFIG.revealDelaySec,
        );
        const tension = waitProgress * (1.0 - mouse.reveal);
        const sinkProgress = Math.min(
            1.0,
            mouse.reveal * 1.15 + Math.max(0, tension - 0.35) * 0.35,
        );

        const surfaceVisibleCount = particles.update(
            timeSec,
            dt,
            mouse,
            sinkProgress,
        );

        renderer.render({
            dt,
            timeSec,
            mouseGlX,
            mouseGlY,
            reveal: mouse.reveal,
            waitProgress,
            surfaceRenderData: particles.renderBuffer,
            surfaceVisibleCount,
        });

        requestAnimationFrame(updateLoop);
    }

    requestAnimationFrame(updateLoop);
}

init().catch((err: unknown) => {
    console.error(err);
});
