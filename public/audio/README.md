# GYST audio

All audio in this directory is original, project-owned, and deterministically generated
by `node scripts/generateAudioAssets.mjs`. It contains no third-party recordings and no
files from `assets/space-packs/`.

The browser plays these pre-rendered PCM masters through a bounded Web Audio mixer with
voice limits, per-cue throttles, stereo positioning, a master compressor, and separate
music/SFX buses. The generator is retained as the editable source and provenance record.
