// Mystpath — TerrainVertexColor
// Minimal URP-compatible unlit-with-diffuse shader that reads per-vertex colors
// from the mesh and applies a single directional diffuse term. No textures needed.
//
// Used by WorldTerrainBuilder to render the procedural hex terrain mesh.
// Vertex colors encode biome identity with elevation-tinted blending at corners.
//
// Lighting model: Lambert diffuse against a fixed sun direction (no shadows for
// this first-pass implementation). Add a ShadowCaster pass and integrate with
// URP lighting when art direction is finalised.

Shader "Mystpath/TerrainVertexColor"
{
    Properties
    {
        // Sun direction in world space (unnormalised; normalised in shader).
        _SunDir ("Sun Direction (World)", Vector) = (0.6, 1.0, 0.4, 0)

        // Minimum ambient light fraction (0 = fully dark shadows, 1 = flat unlit).
        _AmbientStrength ("Ambient Strength", Range(0.0, 1.0)) = 0.38
    }

    SubShader
    {
        Tags
        {
            "RenderType"       = "Opaque"
            "RenderPipeline"   = "UniversalPipeline"
            "Queue"            = "Geometry"
        }

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
            CBUFFER_START(UnityPerMaterial)
                float4 _SunDir;
                float  _AmbientStrength;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
                float4 vertexColor: COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float3 normalWS    : TEXCOORD0;
                float4 vertexColor : COLOR;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings Vert(Attributes IN)
            {
                UNITY_SETUP_INSTANCE_ID(IN);

                Varyings OUT;
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(OUT);

                OUT.positionHCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.normalWS    = TransformObjectToWorldNormal(IN.normalOS);
                OUT.vertexColor = IN.vertexColor;
                return OUT;
            }

            half4 Frag(Varyings IN) : SV_Target
            {
                // Lambert diffuse against a fixed sun direction.
                float3 sunDir  = normalize(_SunDir.xyz);
                float  NdotL   = saturate(dot(normalize(IN.normalWS), sunDir));
                float  light   = _AmbientStrength + (1.0h - _AmbientStrength) * NdotL;

                return half4(IN.vertexColor.rgb * light, 1.0h);
            }

            ENDHLSL
        }

        // DepthOnly pass — required by URP for shadow map and depth prepass.
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
