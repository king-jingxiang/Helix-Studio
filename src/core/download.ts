function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadGcode(gcode: string, name: string, generatorId: string): void {
  const blob = new Blob([gcode], { type: 'text/plain;charset=utf-8' });
  save(blob, `${generatorId}-${name}-${stamp()}.gcode`);
}

export function downloadStl(buffer: ArrayBuffer, name: string, generatorId: string): void {
  const blob = new Blob([buffer], { type: 'model/stl' });
  save(blob, `${generatorId}-${name}-${stamp()}.stl`);
}
