(() => {
  const styledRoots = new WeakMap();

  // The imported rigs keep their own textures, geometry and skeletons. This
  // adapter owns only its materials and ramps, and can restore the originals.
  window.styleJourneyAnime = (root, options = {}) => {
    const THREE = window.THREE;
    if (!THREE || !root?.traverse) return null;
    if (styledRoots.has(root)) return styledRoots.get(root);

    const materials = new Set();
    const ramps = new Map();
    const toonCache = new Map();
    const outlineCache = new Map();
    const assignments = [];
    const outlines = [];
    const viewport = new THREE.Vector2(768, 640);
    const stats = { meshes: 0, materials: 0, outlines: 0, cutouts: 0, transparent: 0 };
    let disposed = false;
    const previousTag = root.userData.journeyAnime;
    const outlinePixels = Number.isFinite(options.outlinePixels) ? Math.max(0, options.outlinePixels) : 1.05;

    const category = (material) => {
      const name = material.name || '';
      if (/HAIR/i.test(name)) return 'hair';
      if (/CLOTH/i.test(name)) return 'cloth';
      if (/(?:Face|Body).*SKIN/i.test(name)) return 'portraitSkin';
      return 'skin';
    };
    const ease = (a, b, x) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };

    function gradient(kind) {
      if (ramps.has(kind)) return ramps.get(kind);
      // Linear RGB, not display RGB. Two short feathered transitions retain
      // painted shadow planes without jagged hard bands on the small canvas.
      const palette = kind === 'hair'
        ? [[.20, .17, .24], [.56, .48, .56], [1, .90, .80]]
        : kind === 'cloth'
          ? [[.16, .15, .23], [.50, .46, .58], [1, .95, .88]]
          : kind === 'portraitSkin'
            ? [[.46, .38, .43], [.73, .65, .68], [1, .95, .89]]
            : [[.32, .28, .36], [.65, .58, .65], [1, .95, .90]];
      const feather = kind === 'portraitSkin' ? .096 : kind === 'hair' ? .07 : .055;
      const data = new Uint8Array(128 * 4);
      for (let index = 0; index < 128; index += 1) {
        const x = index / 127;
        const first = ease(.395 - feather, .395 + feather, x);
        const second = ease(.695 - feather, .695 + feather, x);
        for (let channel = 0; channel < 3; channel += 1) {
          const base = palette[0][channel] + (palette[1][channel] - palette[0][channel]) * first;
          data[index * 4 + channel] = Math.round(255 * (base + (palette[2][channel] - base) * second));
        }
        data[index * 4 + 3] = 255;
      }
      const texture = new THREE.DataTexture(data, 128, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
      texture.name = `JourneyAnime/${kind}-light-ramp`;
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      ramps.set(kind, texture);
      return texture;
    }

    function toon(original) {
      if (toonCache.has(original)) return toonCache.get(original);
      const material = new THREE.MeshToonMaterial();
      material.name = `${original.name || 'Character'}/SoftAnime`;
      if (original.color) material.color.copy(original.color);
      if (original.emissive) material.emissive.copy(original.emissive);
      const properties = [
        'map', 'alphaMap', 'normalMap', 'normalMapType', 'bumpMap', 'bumpScale',
        'aoMap', 'aoMapIntensity', 'lightMap', 'lightMapIntensity', 'emissiveMap',
        'emissiveIntensity', 'displacementMap', 'displacementScale', 'displacementBias',
        'opacity', 'alphaTest', 'transparent', 'side', 'shadowSide', 'vertexColors',
        'depthTest', 'depthWrite', 'depthFunc', 'colorWrite', 'blending', 'blendSrc',
        'blendDst', 'blendEquation', 'blendSrcAlpha', 'blendDstAlpha', 'blendEquationAlpha',
        'premultipliedAlpha', 'dithering', 'fog', 'toneMapped', 'visible',
        'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'alphaHash'
      ];
      properties.forEach((key) => {
        if (original[key] !== undefined) material[key] = original[key];
      });
      if (original.normalScale) material.normalScale.copy(original.normalScale);
      material.gradientMap = gradient(category(original));
      material.alphaToCoverage = original.alphaTest > 0 && !original.transparent;
      material.userData = { ...original.userData, journeyAnime: true, originalMaterial: original.name };
      const navyTrousers = /Bottoms.*CLOTH/i.test(original.name || '');
      const warmEdge = /HAIR|Tops.*CLOTH/i.test(original.name || '');
      material.onBeforeCompile = (shader) => {
        // r160 samples only the ramp's red channel. Keep its complete native
        // skinning/shadow/alpha pipeline, but retain the softly tinted shadows.
        const chunk = THREE.ShaderChunk.gradientmap_pars_fragment.replace(
          /vec3\(\s*texture2D\(\s*gradientMap,\s*coord\s*\)\.r\s*\)/,
          'texture2D( gradientMap, coord ).rgb'
        );
        shader.fragmentShader = shader.fragmentShader.replace('#include <gradientmap_pars_fragment>', chunk);
        if (navyTrousers) {
          // The source trousers use almost-black texels (sRGB 12–39). Remap
          // their existing fold values into ink-blue cloth instead of losing
          // the texture underneath a second, cel-shaded shadow layer.
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
            #include <map_fragment>
            float trouserFold = clamp( ( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) - 0.003 ) / 0.018, 0.0, 1.0 );
            diffuseColor.rgb = mix( vec3( 0.065, 0.070, 0.125 ), vec3( 0.205, 0.200, 0.320 ), trouserFold );
          `);
        }
        if (warmEdge) {
          // A small painted edge, confined to the grazing, key-facing side.
          // It adds no specular lobe and never changes the texture's alpha.
          shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
            #if NUM_DIR_LIGHTS > 0
              float edgeFacing = 1.0 - max( dot( normal, geometryViewDir ), 0.0 );
              float edgeLight = smoothstep( 0.10, 0.65, dot( normal, directionalLights[ 0 ].direction ) );
              float paintedEdge = smoothstep( 0.73, 0.94, edgeFacing ) * edgeLight;
              outgoingLight += vec3( 0.025, 0.0185, 0.01175 ) * paintedEdge;
            #endif
            #include <opaque_fragment>
          `);
        }
      };
      material.customProgramCacheKey = () => `journey-soft-anime-r160-rgb-v3-${navyTrousers ? 'navy' : warmEdge ? 'warm-edge' : 'original'}`;
      materials.add(material);
      toonCache.set(original, material);
      stats.materials += 1;
      if (original.alphaTest > 0) stats.cutouts += 1;
      if (original.transparent) stats.transparent += 1;
      return material;
    }

    function outlineMaterial(original) {
      if (outlineCache.has(original)) return outlineCache.get(original);
      const name = original.name || '';
      const eligible = !original.transparent && /(?:SKIN|CLOTH)/i.test(name);
      const skin = /SKIN/i.test(name);
      const darkCloth = /Bottoms|Shoes/i.test(name);
      const material = new THREE.MeshBasicMaterial({
        color: skin ? 0x674451 : darkCloth ? 0x2f2538 : 0x493449,
        side: THREE.BackSide,
        map: original.map || null,
        alphaMap: original.alphaMap || null,
        alphaTest: original.alphaTest || 0,
        opacity: original.opacity ?? 1,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        fog: original.fog,
        visible: eligible
      });
      material.name = `${name}/AnimeContour`;
      material.alphaToCoverage = original.alphaTest > 0;
      material.userData.journeyAnimeOutline = true;
      const width = outlinePixels * (skin ? .61 : darkCloth ? .80 : 1);
      material.onBeforeCompile = (shader) => {
        shader.uniforms.journeyOutlineWidth = { value: width };
        shader.uniforms.journeyViewport = { value: viewport };
        shader.vertexShader = `uniform float journeyOutlineWidth;\nuniform vec2 journeyViewport;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
          #include <project_vertex>
          #if defined( USE_SKINNING ) || defined( USE_ENVMAP )
            vec3 contourNormal = transformedNormal;
            #ifdef FLIP_SIDED
              contourNormal = -contourNormal;
            #endif
          #else
            vec3 contourNormal = normalMatrix * normal;
          #endif
          vec2 contourProjected = ( projectionMatrix * vec4( contourNormal, 0.0 ) ).xy;
          vec2 contourPixels = contourProjected * journeyViewport;
          vec2 contourDirection = contourPixels / max( length( contourPixels ), 0.00001 );
          gl_Position.xy += contourDirection * ( 2.0 * journeyOutlineWidth / journeyViewport ) * gl_Position.w;
          gl_Position.z += 0.00004 * gl_Position.w;
        `);
        // Texture colour must not tint the ink; its alpha still clips the hull.
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #ifdef USE_MAP
            diffuseColor.a *= texture2D( map, vMapUv ).a;
          #endif
        `);
      };
      material.customProgramCacheKey = () => 'journey-soft-anime-contour-r160-v1';
      outlineCache.set(original, material);
      materials.add(material);
      return material;
    }

    function restore() {
      outlines.forEach((mesh) => mesh.removeFromParent());
      assignments.forEach(({ mesh, original }) => { mesh.material = original; });
      materials.forEach((material) => material.dispose());
      ramps.forEach((texture) => texture.dispose());
      if (previousTag === undefined) delete root.userData.journeyAnime;
      else root.userData.journeyAnime = previousTag;
      styledRoots.delete(root);
    }

    const meshes = [];
    try {
      root.traverse((object) => {
        if (object.isMesh && object.visible && !object.userData.journeyAnimeOutline) meshes.push(object);
      });
      meshes.forEach((mesh) => {
        const original = mesh.material;
        if (!original) return;
        const originals = Array.isArray(original) ? original : [original];
        assignments.push({ mesh, original });
        mesh.material = Array.isArray(original) ? originals.map(toon) : toon(original);
        stats.meshes += 1;
        if (!outlinePixels) return;
        const contourMaterials = originals.map(outlineMaterial);
        if (!contourMaterials.some((material) => material.visible)) return;
        const contourMaterial = Array.isArray(original) ? contourMaterials : contourMaterials[0];
        const contour = mesh.isSkinnedMesh
          ? new THREE.SkinnedMesh(mesh.geometry, contourMaterial)
          : new THREE.Mesh(mesh.geometry, contourMaterial);
        contour.name = `${mesh.name}/AnimeContour`;
        if (mesh.isSkinnedMesh) {
          contour.skeleton = mesh.skeleton;
          contour.bindMode = mesh.bindMode;
          contour.bindMatrix.copy(mesh.bindMatrix);
          contour.bindMatrixInverse.copy(mesh.bindMatrixInverse);
        }
        if (mesh.morphTargetInfluences) contour.morphTargetInfluences = mesh.morphTargetInfluences;
        if (mesh.morphTargetDictionary) contour.morphTargetDictionary = mesh.morphTargetDictionary;
        contour.userData.journeyAnimeOutline = true;
        contour.castShadow = contour.receiveShadow = false;
        contour.frustumCulled = false;
        contour.renderOrder = mesh.renderOrder + 1;
        contour.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(viewport); };
        mesh.add(contour);
        outlines.push(contour);
        stats.outlines += 1;
      });
      root.userData.journeyAnime = { style: 'soft-cel', version: 1, ...stats };
    } catch (error) {
      restore();
      throw error;
    }
    const api = {
      stats,
      dispose() {
        if (disposed) return;
        disposed = true;
        restore();
      }
    };
    styledRoots.set(root, api);
    return api;
  };
})();
