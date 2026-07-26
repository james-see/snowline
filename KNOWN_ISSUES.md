# Known Issues

- Absolute frame-time measurements can drift between sessions; use within-session samples.
- Grind detection is proximity/heuristic; rail snapping can miss on steep approaches.
- Procedural rider/board are placeholders for eventual glTF cosmetics.
- Capture `hold()` stability depends on GPU/driver; Metal ANGLE recommended on Apple Silicon.
- Forest LOD popping may appear on Low preset at long view distances.
