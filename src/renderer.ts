import type { Config } from "./config";
import { drawCenteredText, type SampledAbyssBuffer } from "./particles";
import type { ShaderSources } from "./shaders";

type MainUniformName =
    | "u_surfaceTex"
    | "u_abyssTex"
    | "u_noiseTex"
    | "u_abyssImgTex"
    | "u_res"
    | "u_mouse"
    | "u_target"
    | "u_time"
    | "u_reveal"
    | "u_waitProgress"
    | "u_noiseScale"
    | "u_noiseFlowSpeed"
    | "u_warpStrength"
    | "u_edgeWidth"
    | "u_vortexWallCol"
    | "u_abyssDepthCol";

export interface RenderFrameParams {
    dt: number;
    timeSec: number;
    mouseGlX: number;
    mouseGlY: number;
    reveal: number;
    waitProgress: number;
    surfaceRenderData: Float32Array;
    surfaceVisibleCount: number;
}

function hexToRgb01(hex: string): [number, number, number] {
    const clean = String(hex).replace("#", "");
    const full =
        clean.length === 3
            ? clean
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : clean;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) {
        return [1, 1, 1];
    }
    return [
        ((num >> 16) & 255) / 255,
        ((num >> 8) & 255) / 255,
        (num & 255) / 255,
    ];
}

export class Renderer {
    readonly canvas: HTMLCanvasElement;
    readonly config: Config;
    readonly gl: WebGL2RenderingContext;
    readonly abyssCanvas: HTMLCanvasElement;
    readonly aCtx: CanvasRenderingContext2D;

    readonly mainProgram: WebGLProgram;
    readonly fadeProgram: WebGLProgram;
    readonly surfaceParticlesProgram: WebGLProgram;
    readonly abyssParticlesProgram: WebGLProgram;

    readonly surfaceTex: WebGLTexture;
    readonly abyssTex: WebGLTexture;
    readonly noiseTex: WebGLTexture;
    readonly abyssImgTex: WebGLTexture;

    readonly trailFbo: WebGLFramebuffer;
    readonly abyssParticlesFbo: WebGLFramebuffer;

    readonly emptyVao: WebGLVertexArrayObject;
    readonly surfaceVao: WebGLVertexArrayObject;
    readonly surfaceVbo: WebGLBuffer;
    readonly abyssVao: WebGLVertexArrayObject;
    readonly abyssVbo: WebGLBuffer;
    readonly abyssParticleCount: number;

    readonly uniforms: Record<MainUniformName, WebGLUniformLocation | null>;
    private readonly u_fadeColor: WebGLUniformLocation | null;
    private readonly u_surfaceCssRes: WebGLUniformLocation | null;
    private readonly u_surfaceDpr: WebGLUniformLocation | null;
    private readonly u_abyssCssRes: WebGLUniformLocation | null;
    private readonly u_abyssDpr: WebGLUniformLocation | null;
    private readonly u_abyssTime: WebGLUniformLocation | null;
    private readonly u_abyssReveal: WebGLUniformLocation | null;
    private readonly u_abyssNoiseTex: WebGLUniformLocation | null;

    cssWidth = 1;
    cssHeight = 1;
    dpr = 1;
    physWidth = 1;
    physHeight = 1;
    private trailFadeSec = 0;

    constructor(
        canvas: HTMLCanvasElement,
        config: Config,
        shaders: ShaderSources,
        noiseImage: HTMLImageElement,
        abyssParticles: SampledAbyssBuffer,
    ) {
        this.canvas = canvas;
        this.config = config;
        this.abyssParticleCount = abyssParticles.count;

        const gl = canvas.getContext("webgl2", { antialias: false });
        if (!gl) {
            throw new Error("WebGL2 is not supported in this browser.");
        }
        this.gl = gl;

        canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
        });
        canvas.addEventListener("webglcontextrestored", () => {
            window.location.reload();
        });

        this.abyssCanvas = document.createElement("canvas");
        const aCtx = this.abyssCanvas.getContext("2d");
        if (!aCtx) {
            throw new Error("2D canvas context is not supported.");
        }
        this.aCtx = aCtx;

        this.mainProgram = this.createProgram(shaders.vertex, shaders.fragment);
        this.fadeProgram = this.createProgram(
            shaders.vertex,
            shaders.fadeFragment,
        );
        this.surfaceParticlesProgram = this.createProgram(
            shaders.surfaceParticlesVertex,
            shaders.particlePointFragment,
        );
        this.abyssParticlesProgram = this.createProgram(
            shaders.abyssParticlesVertex,
            shaders.particlePointFragment,
        );

        this.surfaceTex = this.createTexture(0, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
        );

        this.abyssTex = this.createTexture(1, gl.CLAMP_TO_EDGE);

        this.noiseTex = this.createTexture(2, gl.REPEAT);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            noiseImage,
        );

        this.abyssImgTex = this.createTexture(3, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
        );

        this.trailFbo = this.createFbo(this.surfaceTex);
        this.abyssParticlesFbo = this.createFbo(this.abyssImgTex);

        const emptyVao = gl.createVertexArray();
        const surfaceVao = gl.createVertexArray();
        const surfaceVbo = gl.createBuffer();
        const abyssVao = gl.createVertexArray();
        const abyssVbo = gl.createBuffer();
        if (!emptyVao || !surfaceVao || !surfaceVbo || !abyssVao || !abyssVbo) {
            throw new Error("Failed to allocate WebGL2 VAOs/VBOs.");
        }
        this.emptyVao = emptyVao;
        this.surfaceVao = surfaceVao;
        this.surfaceVbo = surfaceVbo;
        this.abyssVao = abyssVao;
        this.abyssVbo = abyssVbo;

        gl.bindVertexArray(this.surfaceVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.surfaceVbo);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            config.particleCount * 5 * Float32Array.BYTES_PER_ELEMENT,
            gl.DYNAMIC_DRAW,
        );
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);

        gl.bindVertexArray(this.abyssVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.abyssVbo);
        gl.bufferData(gl.ARRAY_BUFFER, abyssParticles.data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 40, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 8);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 40, 16);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 40, 24);
        gl.bindVertexArray(null);

        this.uniforms = {
            u_surfaceTex: gl.getUniformLocation(
                this.mainProgram,
                "u_surfaceTex",
            ),
            u_abyssTex: gl.getUniformLocation(this.mainProgram, "u_abyssTex"),
            u_noiseTex: gl.getUniformLocation(this.mainProgram, "u_noiseTex"),
            u_abyssImgTex: gl.getUniformLocation(
                this.mainProgram,
                "u_abyssImgTex",
            ),
            u_res: gl.getUniformLocation(this.mainProgram, "u_res"),
            u_mouse: gl.getUniformLocation(this.mainProgram, "u_mouse"),
            u_target: gl.getUniformLocation(this.mainProgram, "u_target"),
            u_time: gl.getUniformLocation(this.mainProgram, "u_time"),
            u_reveal: gl.getUniformLocation(this.mainProgram, "u_reveal"),
            u_waitProgress: gl.getUniformLocation(
                this.mainProgram,
                "u_waitProgress",
            ),
            u_noiseScale: gl.getUniformLocation(
                this.mainProgram,
                "u_noiseScale",
            ),
            u_noiseFlowSpeed: gl.getUniformLocation(
                this.mainProgram,
                "u_noiseFlowSpeed",
            ),
            u_warpStrength: gl.getUniformLocation(
                this.mainProgram,
                "u_warpStrength",
            ),
            u_edgeWidth: gl.getUniformLocation(this.mainProgram, "u_edgeWidth"),
            u_vortexWallCol: gl.getUniformLocation(
                this.mainProgram,
                "u_vortexWallCol",
            ),
            u_abyssDepthCol: gl.getUniformLocation(
                this.mainProgram,
                "u_abyssDepthCol",
            ),
        };

        this.u_fadeColor = gl.getUniformLocation(
            this.fadeProgram,
            "u_fadeColor",
        );
        this.u_surfaceCssRes = gl.getUniformLocation(
            this.surfaceParticlesProgram,
            "u_cssRes",
        );
        this.u_surfaceDpr = gl.getUniformLocation(
            this.surfaceParticlesProgram,
            "u_dpr",
        );
        this.u_abyssCssRes = gl.getUniformLocation(
            this.abyssParticlesProgram,
            "u_cssRes",
        );
        this.u_abyssDpr = gl.getUniformLocation(
            this.abyssParticlesProgram,
            "u_dpr",
        );
        this.u_abyssTime = gl.getUniformLocation(
            this.abyssParticlesProgram,
            "u_time",
        );
        this.u_abyssReveal = gl.getUniformLocation(
            this.abyssParticlesProgram,
            "u_reveal",
        );
        this.u_abyssNoiseTex = gl.getUniformLocation(
            this.abyssParticlesProgram,
            "u_noiseTex",
        );

        gl.useProgram(this.abyssParticlesProgram);
        gl.uniform1i(this.u_abyssNoiseTex, 2);

        gl.useProgram(this.mainProgram);
        gl.uniform1i(this.uniforms.u_surfaceTex, 0);
        gl.uniform1i(this.uniforms.u_abyssTex, 1);
        gl.uniform1i(this.uniforms.u_noiseTex, 2);
        gl.uniform1i(this.uniforms.u_abyssImgTex, 3);
        gl.uniform1f(this.uniforms.u_noiseScale, config.noiseScale);
        gl.uniform1f(this.uniforms.u_noiseFlowSpeed, config.noiseFlowSpeed);
        gl.uniform1f(this.uniforms.u_warpStrength, config.warpStrength);
        gl.uniform1f(this.uniforms.u_edgeWidth, config.edgeWidth);
        gl.uniform3fv(
            this.uniforms.u_vortexWallCol,
            hexToRgb01(config.colors.vortexWall),
        );
        gl.uniform3fv(
            this.uniforms.u_abyssDepthCol,
            hexToRgb01(config.colors.abyssDepth),
        );
    }

    createShader(type: number, source: string): WebGLShader {
        const gl = this.gl;
        const shader = gl.createShader(type);
        if (!shader) {
            throw new Error("Failed to allocate WebGL shader.");
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compilation failed: ${log ?? "unknown"}`);
        }
        return shader;
    }

    createProgram(vsSource: string, fsSource: string): WebGLProgram {
        const gl = this.gl;
        const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);

        const program = gl.createProgram();
        if (!program) {
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            throw new Error("Failed to create WebGL program.");
        }
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            throw new Error(`Program link failed: ${log ?? "unknown"}`);
        }

        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return program;
    }

    private createTexture(unit: number, wrap: number): WebGLTexture {
        const gl = this.gl;
        const tex = gl.createTexture();
        if (!tex) {
            throw new Error("Failed to allocate WebGL texture.");
        }
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return tex;
    }

    private createFbo(texture: WebGLTexture): WebGLFramebuffer {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        if (!fbo) {
            throw new Error("Failed to allocate WebGL framebuffer.");
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return fbo;
    }

    drawAbyssMask(width: number, height: number, dpr = this.dpr): void {
        this.abyssCanvas.width = width;
        this.abyssCanvas.height = height;
        const textColors = Array.isArray(this.config.colors.abyssText)
            ? this.config.colors.abyssText
            : [this.config.colors.abyssText];
        drawCenteredText(this.aCtx, this.config.abyssText, width, height, {
            maxWidthRatio: 0.76,
            fontScale: 0.085,
            maxFontSize: Math.round(110 * dpr),
            lineHeightRatio: 1.38,
            lineColors: textColors,
            transparentBackground: true,
        });
    }

    resize(cssWidth: number, cssHeight: number, dpr = 1): void {
        const gl = this.gl;
        this.cssWidth = Math.max(1, cssWidth);
        this.cssHeight = Math.max(1, cssHeight);
        this.dpr = Math.max(1, dpr);
        this.physWidth = Math.max(1, Math.round(this.cssWidth * this.dpr));
        this.physHeight = Math.max(1, Math.round(this.cssHeight * this.dpr));

        this.canvas.width = this.physWidth;
        this.canvas.height = this.physHeight;
        gl.viewport(0, 0, this.physWidth, this.physHeight);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.surfaceTex);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.physWidth,
            this.physHeight,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
        );

        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.abyssImgTex);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.physWidth,
            this.physHeight,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
        );

        gl.clearColor(0, 0, 0, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFbo);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.trailFadeSec = 0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.abyssParticlesFbo);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.drawAbyssMask(this.physWidth, this.physHeight, this.dpr);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.abyssTex);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            this.abyssCanvas,
        );
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }

    render({
        dt,
        timeSec,
        mouseGlX,
        mouseGlY,
        reveal,
        waitProgress,
        surfaceRenderData,
        surfaceVisibleCount,
    }: RenderFrameParams): void {
        const gl = this.gl;
        gl.viewport(0, 0, this.physWidth, this.physHeight);

        // Pass 1: Surface particle trail FBO (fade existing trails + draw visible particles)
        if (surfaceVisibleCount > 0) {
            this.trailFadeSec = 0.5;
        }
        if (surfaceVisibleCount > 0 || this.trailFadeSec > 0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFbo);
            if (surfaceVisibleCount === 0) {
                this.trailFadeSec = Math.max(0, this.trailFadeSec - dt);
            }
            if (surfaceVisibleCount === 0 && this.trailFadeSec === 0) {
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            } else {
                gl.enable(gl.BLEND);

                const keep = Math.pow(0.42, dt * 60.0);
                const fadeAlpha = 1.0 - keep;
                gl.useProgram(this.fadeProgram);
                gl.bindVertexArray(this.emptyVao);
                gl.blendEquation(gl.FUNC_ADD);
                gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
                gl.uniform4f(this.u_fadeColor, 0, 0, 0, fadeAlpha);
                gl.drawArrays(gl.TRIANGLES, 0, 3);

                // Prevent 8-bit UNORM truncation from stalling faint trails at 1/255 on high-Hz displays
                if (keep >= 0.5) {
                    gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
                    gl.blendFunc(gl.ONE, gl.ONE);
                    gl.uniform4f(
                        this.u_fadeColor,
                        1 / 255,
                        1 / 255,
                        1 / 255,
                        1 / 255,
                    );
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }

                if (surfaceVisibleCount > 0) {
                    gl.blendEquation(gl.FUNC_ADD);
                    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.surfaceVbo);
                    gl.bufferSubData(
                        gl.ARRAY_BUFFER,
                        0,
                        surfaceRenderData.subarray(0, surfaceVisibleCount * 5),
                    );
                    gl.useProgram(this.surfaceParticlesProgram);
                    gl.bindVertexArray(this.surfaceVao);
                    gl.uniform2f(
                        this.u_surfaceCssRes,
                        this.cssWidth,
                        this.cssHeight,
                    );
                    gl.uniform1f(this.u_surfaceDpr, this.dpr);
                    gl.drawArrays(gl.POINTS, 0, surfaceVisibleCount);
                }
            }
        }

        // Pass 2: Static abyss particle VBO animated entirely in vertex shader
        if (reveal > 0.0001 && this.abyssParticleCount > 0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.abyssParticlesFbo);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
            gl.useProgram(this.abyssParticlesProgram);
            gl.bindVertexArray(this.abyssVao);
            gl.uniform2f(this.u_abyssCssRes, this.cssWidth, this.cssHeight);
            gl.uniform1f(this.u_abyssDpr, this.dpr);
            gl.uniform1f(this.u_abyssTime, timeSec);
            gl.uniform1f(this.u_abyssReveal, reveal);
            gl.drawArrays(gl.POINTS, 0, this.abyssParticleCount);
        }

        // Pass 3: Composite surface, abyss, and Perlin dissolve to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.surfaceTex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.abyssTex);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.abyssImgTex);

        gl.useProgram(this.mainProgram);
        gl.bindVertexArray(this.emptyVao);
        gl.uniform2f(this.uniforms.u_res, this.physWidth, this.physHeight);
        gl.uniform2f(this.uniforms.u_mouse, mouseGlX, mouseGlY);
        gl.uniform2f(
            this.uniforms.u_target,
            this.config.blindSpot.x,
            this.config.blindSpot.y,
        );
        gl.uniform1f(this.uniforms.u_time, timeSec);
        gl.uniform1f(this.uniforms.u_reveal, reveal);
        gl.uniform1f(this.uniforms.u_waitProgress, waitProgress);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}
