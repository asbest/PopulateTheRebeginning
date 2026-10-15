# Bundled runtime dependencies

The browser imports these files locally. This preserves the original library versions while removing runtime CDN requirements.

| Library | Version | File | License |
|---|---|---|---|
| Three.js | 0.128.0 | three.module.js | THREE-LICENSE.txt (MIT) |
| Three.js KTX2/Basis loaders and decoder | 0.128.0 | KTX2Loader.js, BasisTextureLoader.js, libs/, basis/ | THREE-LICENSE.txt (MIT); BASIS-LICENSE.txt (Apache 2.0) |
| simplex-noise | 2.4.0 | simplex-noise.min.js | SIMPLEX-LICENSE.txt (MIT) |
| PeerJS | 1.5.2 | peerjs.min.js | PEERJS-LICENSE.txt (MIT) |
| Rapier 3D compatibility | 0.11.2 | rapier.es.js | RAPIER-LICENSE.txt (Apache 2.0) |

Rapier's compatibility ES module embeds its WebAssembly payload; no additional WASM file or CDN request is needed. KTX2 decoding uses the local `basis/basis_transcoder.wasm`. Online PeerJS signaling remains an external service used only for multiplayer. `tools/vendor-dependencies.mjs` records the pinned upstream download URLs.
