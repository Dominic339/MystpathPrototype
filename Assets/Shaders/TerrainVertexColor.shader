// Mystpath — TerrainVertexColor (Enhanced Surface)
// URP-compatible terrain shader that reads per-vertex biome colors and applies
// four layered procedural surface effects driven by UV0 data from WorldTerrainBuilder:
//
//   UV0.x = BaseElevation (raw 0–1+ range) — drives elevation snow.
//   UV0.y = IsShore flag  (0 or 1, bilinearly blended at corners) — drives shore wetness.
//
// Surface effect pipeline (applied in fragment, in order):
//   1. Vertex color    — biome identity, shore sand blend, elevation tint (baked in mesh).
//   2. Surface grain   — two-octave value noise on world XZ breaks up flat color patches.
//                        Reads as grass blades / sand ripples / stone chips depending on
//                        the underlying biome color. Scale and strength are tunable.
//   3. Shore wetness   — UV0.y blends in a dark damp overlay on shoreline cells,
//                        adding wetness on top of the sandy vertex color from BiomeBlendCalculator.
//   4. Slope rock      — where surface normals are steep (NdotUp below threshold) the
//                        surface blends toward a rock/scree color. Mountain cliff faces
//                        read as bare rock regardless of biome.
//   5. Elevation snow  — UV0.x above _SnowElevation blends in a snow color. Applied last
//                        so snow covers both rock and soil. Only mountain peaks reliably
//                        exceed the default threshold (0.82); flat biomes do not.
//   6. Lambert diffuse — fixed sun direction, configurable ambient minimum. No real-time
//                        shadows yet; add a ShadowCaster pass when art direction is set.
//
// Shader name is kept as "Mystpath/TerrainVertexColor" so WorldTerrainBuilder's
// Shader.Find fallback continues to work without Inspector reassignment.

Shader "Mystpath/TerrainVertexColor"
{
    Properties
    {
        // ── Lighting ────────────────────────────────────────────────────────────
        _SunDir          ("Sun Direction (World)",         Vector)        = (0.6, 1.0, 0.4, 0)
        _AmbientStrength ("Ambient Strength",              Range(0, 1))   = 0.38

        // ── Surface Grain ────────────────────────────────────────────────────────
        // Two-octave value noise applied in world XZ. Breaks up flat biome color
        // patches so the surface reads as grass, sand, or stone depending on color.
        [Header(Surface Grain)]
        _NoiseScale      ("Noise Scale (world units)",     Range(0.5, 16))  = 3.5
        _NoiseStrength   ("Noise Strength",                Range(0, 0.5))   = 0.18

        // ── Shore Wetness ────────────────────────────────────────────────────────
        // UV0.y encodes IsShore (1 = shore, interpolated at corners). Shore cells
        // blend toward this darker overlay color to read as wet sand / mud.
        [Header(Shore Wetness)]
        _ShoreWetColor   ("Shore Wet Overlay",             Color)           = (0.40, 0.38, 0.28, 1)
        _ShoreWetStrength("Shore Wet Strength",            Range(0, 1))     = 0.30

        // ── Slope Rock ──────────────────────────────────────────────────────────
        // Where NdotUp (dot of surface normal with world up) is below _SlopeThreshold
        // the surface blends toward a rocky scree color. NdotUp = 1 = flat, 0 = wall.
        [Header(Slope Rock)]
        _SlopeRockColor  ("Slope Rock Colour",             Color)           = (0.46, 0.43, 0.40, 1)
        _SlopeThreshold  ("Rock Slope Threshold (NdotUp)", Range(0, 1))     = 0.82
        _SlopeBlend      ("Rock Slope Blend Width",        Range(0.01, 0.4)) = 0.20

        // ── Elevation Snow ───────────────────────────────────────────────────────
        // UV0.x encodes raw BaseElevation (interpolated at corners). Above
        // _SnowElevation the surface blends to snow. Applied after slope rock
        // so snow caps cover bare cliff faces. Mountain peaks (elevation 1.0–1.8)
        // reliably exceed the default threshold (0.82); flat biomes (~0.4–0.6) do not.
        [Header(Elevation Snow)]
        _SnowColor       ("Snow Colour",                   Color)           = (0.90, 0.93, 0.96, 1)
        _SnowElevation   ("Snow Start Elevation",          Range(0, 2))     = 0.82
        _SnowBlend       ("Snow Blend Width",              Range(0.01, 0.5)) = 0.14
    }

    SubShader
    {
        Tags
        {
            "RenderType"       = "Opaque"
            "RenderPipeline"   = "UniversalPipeline"
            "Queue"            = "Geometry"
        }

        // ── Forward Lit Pass ─────────────────────────────────────────────────────
        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            Cull  Back
            ZTest LEqual
            ZWrite On

            HLSLPROGRAM
            #pragma vertex   Vert
            #pragma fragment Frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            // Per-material constant buffer (required by URP SRP Batcher).
            // All Properties must be declared here.
            CBUFFER_START(UnityPerMaterial)
                float4 _SunDir;
                float  _AmbientStrength;

                float  _NoiseScale;
                float  _NoiseStrength;

                float4 _ShoreWetColor;
                float  _ShoreWetStrength;

                float4 _SlopeRockColor;
                float  _SlopeThreshold;
                float  _SlopeBlend;

                float4 _SnowColor;
                float  _SnowElevation;
                float  _SnowBlend;
            CBUFFER_END

            // ── Vertex input / output ───────────────────────────────────────────
            struct Attributes
            {
                float4 positionOS  : POSITION;
                float3 normalOS    : NORMAL;
                float4 vertexColor : COLOR;
                float2 texcoord0   : TEXCOORD0;   // UV0: .x = BaseElevation, .y = IsShore
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float3 normalWS    : TEXCOORD0;
                float4 vertexColor : COLOR;
                float2 uv          : TEXCOORD1;   // UV0 interpolated: .x = elevation, .y = shore
                float3 positionWS  : TEXCOORD2;   // World-space position for noise sampling
                UNITY_VERTEX_OUTPUT_STEREO
            };

            // ── Procedural surface-grain helpers ────────────────────────────────
            // Simple value noise (no texture lookups, SM3.0 compatible).
            // Applied to world XZ to simulate grass / sand / stone surface texture.

            float MysHash(float2 p)
            {
                p  = frac(p * float2(127.1, 311.7));
                p += dot(p, p + 19.19);
                return frac(p.x * p.y);
            }

            float MysNoise(float2 p)
            {
                float2 i = floor(p);
                float2 f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);   // smoothstep
                return lerp(
                    lerp(MysHash(i),               MysHash(i + float2(1, 0)), u.x),
                    lerp(MysHash(i + float2(0, 1)), MysHash(i + float2(1, 1)), u.x),
                    u.y);
            }

            // ── Vertex shader ───────────────────────────────────────────────────
            Varyings Vert(Attributes IN)
            {
                UNITY_SETUP_INSTANCE_ID(IN);

                Varyings OUT;
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(OUT);

                OUT.positionHCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.normalWS    = TransformObjectToWorldNormal(IN.normalOS);
                OUT.vertexColor = IN.vertexColor;
                OUT.uv          = IN.texcoord0;
                OUT.positionWS  = TransformObjectToWorld(IN.positionOS.xyz);
                return OUT;
            }

            // ── Fragment shader ─────────────────────────────────────────────────
            half4 Frag(Varyings IN) : SV_Target
            {
                // ── 1. Base colour: per-vertex biome blend ──────────────────────
                // BiomeBlendCalculator already baked in: biome color, elevation tint,
                // and 50 % shore-sand blend at IsShore cells (corner-blended).
                half3 col = IN.vertexColor.rgb;

                // ── 2. Surface grain (two-octave value noise) ───────────────────
                // Samples world XZ with two frequencies for organic variation.
                // Multiplier is centred at 1.0 so it darkens and lightens equally,
                // reading as grass variation / sand ripples / stone chips depending
                // on the underlying biome color without shifting hue.
                float2 worldXZ = IN.positionWS.xz;
                float  n1      = MysNoise(worldXZ * _NoiseScale);
                float  n2      = MysNoise(worldXZ * _NoiseScale * 2.3 + float2(17.3, 43.1));
                float  noise   = n1 * 0.65 + n2 * 0.35;
                // Map [0,1] → multiplier centred at 1: [1 - s/2, 1 + s/2]
                float  noiseMul = 1.0 - _NoiseStrength * 0.5 + noise * _NoiseStrength;
                col *= noiseMul;

                // ── 3. Shore wetness overlay ────────────────────────────────────
                // UV.y encodes IsShore (bilinearly interpolated at corners, so it
                // fades naturally into inland cells). Blends a darker damp color
                // over the already-sandy vertex color for a wet-beach read.
                float shoreT = saturate(IN.uv.y) * _ShoreWetStrength;
                col = lerp(col, _ShoreWetColor.rgb, shoreT);

                // ── 4. Slope-based rock blending ────────────────────────────────
                // NdotUp = dot(worldNormal, up) — 1.0 = flat ground, 0.0 = vertical.
                // Steep faces blend toward a rocky scree color so mountain sides
                // and cliff edges read as bare exposed rock.
                float3 normalWS = normalize(IN.normalWS);
                float  NdotUp   = saturate(normalWS.y);
                // rockT = 0 on flat surfaces, 1 on steep surfaces.
                float  rockT = 1.0 - smoothstep(
                    _SlopeThreshold - _SlopeBlend, _SlopeThreshold, NdotUp);
                col = lerp(col, _SlopeRockColor.rgb, rockT * 0.75);

                // ── 5. Elevation snow ───────────────────────────────────────────
                // UV.x carries raw BaseElevation (interpolated at corners). Applied
                // after slope rock so snow covers rocky cliff faces on peaks.
                // Mountain peaks reach elevation 1.0–1.8; default threshold is 0.82,
                // so flat biomes (elevation ~0.4–0.6) never receive snow.
                float elev  = IN.uv.x;
                float snowT = smoothstep(_SnowElevation, _SnowElevation + _SnowBlend, elev);
                col = lerp(col, _SnowColor.rgb, snowT);

                // ── 6. Lambert diffuse lighting ─────────────────────────────────
                float3 sunDir = normalize(_SunDir.xyz);
                float  NdotL  = saturate(dot(normalWS, sunDir));
                float  light  = _AmbientStrength + (1.0 - _AmbientStrength) * NdotL;
                col *= light;

                return half4(col, 1.0);
            }

            ENDHLSL
        }

        // ── DepthOnly pass ────────────────────────────────────────────────────────
        // Required by URP for shadow map and depth prepass.
        // The CBUFFER must declare all Properties for SRP Batcher compatibility.
        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }

            Cull   Back
            ZWrite On
            ColorMask 0

            HLSLPROGRAM
            #pragma vertex   DepthVert
            #pragma fragment DepthFrag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _SunDir;
                float  _AmbientStrength;

                float  _NoiseScale;
                float  _NoiseStrength;

                float4 _ShoreWetColor;
                float  _ShoreWetStrength;

                float4 _SlopeRockColor;
                float  _SlopeThreshold;
                float  _SlopeBlend;

                float4 _SnowColor;
                float  _SnowElevation;
                float  _SnowBlend;
            CBUFFER_END

            struct DepthAttribs  { float4 pos : POSITION; };
            struct DepthVaryings { float4 hcs : SV_POSITION; };

            DepthVaryings DepthVert(DepthAttribs IN)
            {
                DepthVaryings OUT;
                OUT.hcs = TransformObjectToHClip(IN.pos.xyz);
                return OUT;
            }

            half4 DepthFrag() : SV_Target { return 0; }
            ENDHLSL
        }
    }

    // Fall back to URP error shader if this shader fails to compile,
    // so the problem is immediately visible in the editor.
    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
