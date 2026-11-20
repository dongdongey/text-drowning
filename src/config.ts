import laughingCatUrl from "./assets/laughing_cat.png";
import shockingCatUrl from "./assets/shocking_cat.png";

export interface Point2D {
    x: number;
    y: number;
}

export interface ThemeColors {
    vortexWall: string;
    abyssDepth: string;
    abyssText: string | string[];
}

export interface AbyssImageConfig {
    src: string;
    x: number;
    y: number;
    anchorX?: number;
    anchorY?: number;
    heightRatio: number;
    particleCount: number;
    gamma?: number;
    invert?: boolean;
}

export interface Config {
    surfaceText: string | string[];
    abyssText: string | string[];
    particleCount: number;
    abyssImages: AbyssImageConfig[];
    mouseRadius: number;
    swayForce: number;
    springReturn: number;
    damping: number;
    revealDelaySec: number;
    autoResetSec: number;
    zoneRadius: number;
    stillSpeedThreshold: number;
    blindSpot: Point2D;
    noiseScale: number;
    spreadSpeed: number;
    closeSpeed: number;
    noiseFlowSpeed: number;
    warpStrength: number;
    edgeWidth: number;
    colors: ThemeColors;
}

const REVEAL_DELAY_SEC = 5.0;

export const CONFIG: Config = {
    surfaceText: "빠져드는\n디텍",
    abyssText: ["빠져서 없어짐", "수고하세요"],

    // Surface particle physics & cursor spotlight reveal
    particleCount: 6000,
    abyssImages: [
        {
            src: laughingCatUrl,
            x: 0.98,
            y: 1.0,
            anchorX: 1.0,
            anchorY: 1.0,
            heightRatio: 0.7,
            particleCount: 5000,
            gamma: 1.7,
        },
        {
            src: shockingCatUrl,
            x: 0.0,
            y: 1.0,
            anchorX: 0.0,
            anchorY: 1.0,
            heightRatio: 0.8,
            particleCount: 6000,
            gamma: 1.2,
        },
    ],
    mouseRadius: 135,
    swayForce: 0.22,
    springReturn: 0.085,
    damping: 0.84,

    // Sink-in state machine
    revealDelaySec: REVEAL_DELAY_SEC,
    autoResetSec: REVEAL_DELAY_SEC + 5.0,
    zoneRadius: 1 / 3,
    stillSpeedThreshold: 27, // CSS px/sec (0.45 px/frame at 60fps)
    blindSpot: {
        x: 0.5,
        y: 0.5,
    },

    // Perlin noise diffusion shader parameters
    noiseScale: 4.2,
    spreadSpeed: 1.05,
    closeSpeed: 6.67, // ~0.15s rapid collapse back to surface
    noiseFlowSpeed: 0.16,
    warpStrength: 1.35,
    edgeWidth: 0.042,

    // Matte colors (no glow/neon)
    colors: {
        vortexWall: "#3d4557",
        abyssDepth: "#26262e",
        abyssText: ["#f2f2f5", "#e03131"],
    },
};
