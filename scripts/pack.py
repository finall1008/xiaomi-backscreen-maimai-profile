"""Package only installable module files, never local settings or signing materials."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "module.json").read_text(encoding="utf-8"))
files = [ROOT / "module.json", ROOT / "icon.png"]
for directory in ("card", "webroot", "background"):
    files.extend(sorted(p for p in (ROOT / directory).rglob("*") if p.is_file()))
required = {"module.json", "card/index.html", "card/main.js", "webroot/index.html", "webroot/main.js"}
if "background" in manifest:
    required.add("background/main.js")
names = {p.relative_to(ROOT).as_posix() for p in files}
if not required <= names:
    raise SystemExit("模块缺少文件：" + ", ".join(sorted(required - names)))
if "webroot/bridge-shim.js" in names:
    raise SystemExit("bridge-shim.js 应由宿主提供，不能随模块固定旧版本")
output = ROOT / "dist" / f"MaimaiRearProfile-v{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(files):
        entry = zipfile.ZipInfo(file.relative_to(ROOT).as_posix(), date_time=(2024, 1, 1, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, file.read_bytes())
print(f"已打包 {output.relative_to(ROOT)} ({output.stat().st_size:,} bytes)")
