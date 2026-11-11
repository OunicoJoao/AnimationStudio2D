/**
 * Arquivo de projeto .as2d: um ZIP com project.json, uma PNG por célula e o áudio.
 * @module io/ProjectFile
 */
import { zipStore, unzip } from './zip.js';
import { Project } from '../model/Project.js';
import { canvasToBlob, blobToCanvas, isCanvasEmpty } from '../render/canvas.js';

export const PROJECT_EXT = '.as2d';
export const PROJECT_MIME = 'application/x-animationstudio2d+zip';

const celFile = (layerId, frameId) => `cels/${layerId}_${frameId}.png`;

/** @param {Project} project @returns {Promise<Blob>} */
export async function projectToZip(project) {
  const files = [];
  const cels = [];
  for (const [key, canvas] of project.cels) {
    if (isCanvasEmpty(canvas)) continue;
    const [layerId, frameId] = key.split(':');
    const name = celFile(layerId, frameId);
    const blob = await canvasToBlob(canvas);
    files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
    cels.push({ layer: layerId, frame: frameId, file: name });
  }
  const meta = project.toJSON();
  meta.cels = cels;
  if (project.audio) {
    const ext = (project.audio.name.match(/\.[a-z0-9]+$/i) || ['.bin'])[0];
    meta.audio.file = 'audio/track' + ext;
    meta.audio.type = project.audio.blob.type;
    files.push({ name: meta.audio.file, data: new Uint8Array(await project.audio.blob.arrayBuffer()) });
  }
  files.unshift({ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(meta, null, 1)) });
  return new Blob([zipStore(files)], { type: PROJECT_MIME });
}

/**
 * @param {Blob} blob
 * @param {import('../model/Project.js').CanvasFactory} factory
 * @returns {Promise<Project>}
 */
export async function projectFromZip(blob, factory) {
  const files = await unzip(new Uint8Array(await blob.arrayBuffer()));
  const json = files.get('project.json');
  if (!json) throw new Error('Este arquivo não é um projeto do AnimationStudio.');
  const meta = JSON.parse(new TextDecoder().decode(json));
  if (meta.format !== 'animationstudio2d') throw new Error('Formato de projeto desconhecido.');
  let audio = null;
  if (meta.audio?.file && files.get(meta.audio.file)) {
    audio = { blob: new Blob([files.get(meta.audio.file)], { type: meta.audio.type || '' }), name: meta.audio.name, offset: meta.audio.offset || 0, volume: meta.audio.volume ?? 1 };
  }
  const project = new Project({ ...meta, audio }, factory);
  for (const c of meta.cels || []) {
    const data = files.get(c.file);
    if (!data || !project.layerById(c.layer) || !project.frameById(c.frame)) continue;
    const img = await blobToCanvas(new Blob([data], { type: 'image/png' }));
    const cel = project.ensureCel(c.layer, c.frame);
    cel.getContext('2d').drawImage(img, 0, 0);
  }
  project.dirtyCels = new Set(project.cels.keys());
  return project;
}
