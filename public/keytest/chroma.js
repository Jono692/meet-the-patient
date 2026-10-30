var Chroma = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/chroma.js
  var chroma_exports = {};
  __export(chroma_exports, {
    startChroma: () => startChroma
  });
  var VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;
  var FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec3 u_key;
uniform vec3 u_bg;
uniform float u_similarity;
uniform float u_smoothness;
uniform float u_spill;
varying vec2 v_uv;

vec2 toUV(vec3 c) {
  return vec2(
    c.r * -0.169 + c.g * -0.331 + c.b *  0.500 + 0.5,
    c.r *  0.500 + c.g * -0.419 + c.b * -0.081 + 0.5
  );
}

void main() {
  vec4 px = texture2D(u_tex, v_uv);
  float dist = distance(toUV(px.rgb), toUV(u_key));
  float base = dist - u_similarity;
  float mask = pow(clamp(base / u_smoothness, 0.0, 1.0), 1.5);

  // Green bouncing off a white shirt is the usual giveaway. Desaturate what
  // is close to the key but not keyed out.
  float spillMask = pow(clamp(base / u_spill, 0.0, 1.0), 1.5);
  float luma = dot(px.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 colour = mix(vec3(luma), px.rgb, spillMask);

  gl_FragColor = vec4(mix(u_bg, colour, mask), 1.0);
}`;
  function hexToRgb(hex) {
    const h = String(hex || "").replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function sampleKey(video, x = 0.02, y = 0.04, w = 0.1, h = 0.14) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    ctx.drawImage(video, Math.round(x * vw), Math.round(y * vh), Math.round(w * vw), Math.round(h * vh), 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    const n = d.length / 4;
    return [r / n / 255, g / n / 255, b / n / 255];
  }
  function startChroma(video, canvas, opts = {}) {
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: false, alpha: false });
    if (!gl) throw new Error("WebGL unavailable");
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const u = {
      key: gl.getUniformLocation(prog, "u_key"),
      bg: gl.getUniformLocation(prog, "u_bg"),
      similarity: gl.getUniformLocation(prog, "u_similarity"),
      smoothness: gl.getUniformLocation(prog, "u_smoothness"),
      spill: gl.getUniformLocation(prog, "u_spill")
    };
    const state = {
      key: opts.key ? hexToRgb(opts.key) : null,
      bg: hexToRgb(opts.background || "#003595"),
      similarity: opts.similarity ?? 0.36,
      smoothness: opts.smoothness ?? 0.1,
      spill: opts.spill ?? 0.14
    };
    let raf = 0;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      raf = requestAnimationFrame(draw);
      if (!video.videoWidth) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      if (!state.key) {
        state.key = sampleKey(video) || [0.32, 0.5, 0.29];
        console.log("[chroma] sampled key #" + state.key.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join(""));
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      gl.uniform3fv(u.key, state.key);
      gl.uniform3fv(u.bg, state.bg);
      gl.uniform1f(u.similarity, state.similarity);
      gl.uniform1f(u.smoothness, state.smoothness);
      gl.uniform1f(u.spill, state.spill);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    draw();
    return {
      stop() {
        stopped = true;
        cancelAnimationFrame(raf);
      },
      // Live tuning from the console: __chroma.set({ similarity: 0.42 })
      set(p) {
        if (p.background) state.bg = hexToRgb(p.background);
        if (p.key) state.key = hexToRgb(p.key);
        if (p.resample) state.key = null;
        for (const k of ["similarity", "smoothness", "spill"]) if (p[k] != null) state[k] = p[k];
        return { ...state, key: state.key && state.key.map((v) => Math.round(v * 255)) };
      }
    };
  }
  return __toCommonJS(chroma_exports);
})();
