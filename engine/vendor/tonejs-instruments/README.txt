Sampled instruments from tonejs-instruments by Nicholaus P. Brosowsky
(https://github.com/nbrosowsky/tonejs-instruments): code MIT, samples
released under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).
The samples come from the VSCO 2 Community Edition, Karoryfer Samples, the
University of Iowa Electronic Music Studios, and Freesound contributors
flcellogrl, quartertone and donyaquick (see sample-source-info.txt).

What is served is packed (scripts/pack-samples.js): packed/<instrument>.<hash>.mp3
holds the fourteen notes the engine plays, each held to five seconds, re-encoded
as mono 96 kbps MP3; manifest.js says where each note starts in it. The original
recordings, every note of every instrument, are kept in samples-src/ (not served,
not deployed) for packing again. The coming-soon page credits them (soon.html).
