import abyssParticlesVertexSource from "./shaders/abyss_particles.vert?raw";
import fadeFragmentSource from "./shaders/fade.frag?raw";
import fragmentSource from "./shaders/fragment.frag?raw";
import particlePointFragmentSource from "./shaders/particle_point.frag?raw";
import surfaceParticlesVertexSource from "./shaders/surface_particles.vert?raw";
import vertexSource from "./shaders/vertex.vert?raw";

export interface ShaderSources {
    vertex: string;
    fragment: string;
    fadeFragment: string;
    surfaceParticlesVertex: string;
    abyssParticlesVertex: string;
    particlePointFragment: string;
}

export const SHADERS: ShaderSources = {
    vertex: vertexSource,
    fragment: fragmentSource,
    fadeFragment: fadeFragmentSource,
    surfaceParticlesVertex: surfaceParticlesVertexSource,
    abyssParticlesVertex: abyssParticlesVertexSource,
    particlePointFragment: particlePointFragmentSource,
};
