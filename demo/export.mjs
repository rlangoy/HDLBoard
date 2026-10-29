import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const dir = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(dir, 'output', 'hdlboard-demo.webm');
const assets = path.join(dir, '..', 'assets');
await mkdir(assets, { recursive: true });
await copyFile(source, path.join(assets, 'demo.webm'));
await new Promise((resolve, reject) => {
  const child = spawn(ffmpeg, ['-y', '-i', source, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(assets, 'demo.mp4')], { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`MP4 conversion failed (${code})`)));
});
// A short looping preview that GitHub's Markdown renderer can display.
await new Promise((resolve, reject) => {
  const child = spawn(ffmpeg, ['-y', '-ss', '8', '-t', '20', '-i', source, '-filter_complex', 'fps=8,scale=640:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle', '-loop', '0', path.join(assets, 'demo.gif')], { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`GIF conversion failed (${code})`)));
});
